/**
 * 地面反射的「细节层」几何缓存。
 *
 * 渲染反射贴图时用本模块的低模几何替换原网格再拍一次镜像，把反射通道的三角形数压下来。对外
 * 为 createReflectionDetail 工厂，返回 {stats, prepare, get, dispose}：prepare 把符合条件的
 * 几何打包交给 Web Worker 减面后缓存，get 按网格取用，dispose 释放缓存并终止 Worker。误差
 * 预算按网格世界缩放折算，保证不同缩放物件在屏幕上的误差观感一致。
 */

/**
 * 创建反射细节层控制器。
 */
export function createReflectionDetail({
  THREE: THREE,
  requestFrame: requestFrame = () => {},
  makeWorker: makeWorker = () =>
    new Worker(new URL("./studio-reflection-detail-worker.js", import.meta.url), {
      type: "module"
    })
}) {
  // 两张索引表分别按「源几何」与「任务 id」查记录：前者用于渲染时取用、后者用于回包匹配。
  const recordByGeometry = new Map();
  const recordById = new Map();
  let worker;
  let recordIdSequence = 0;
  let isDisposed = false;
  // Worker 失败是一次性的：一旦失败就不再重试，避免每帧都尝试创建 Worker。
  let isWorkerFailed = false;
  const stats = {
    prepared: 0,
    pending: 0,
    failed: 0,
    sourceTriangles: 0,
    detailTriangles: 0,
    bytes: 0
  };
  // 细节层几何的总字节上限 16 MiB：反射是附加效果，不能让它把显存吃到影响主画面。
  const MAX_DETAIL_BYTE_BUDGET = 16777216;
  // 记录几何的属性版本签名。几何可能被上层原地改写（例如换了贴图或改了顶点），
  // 版本号一变缓存就必须作废，否则会拿旧的简化结果去渲染新形状。
  const buildAttributeSignature = geometry =>
    [["index", geometry.index], ...Object.entries(geometry.attributes)].map(
      ([entryName, attribute]) => ({
        name: entryName,
        attribute: attribute,
        version: attribute.version,
        dataVersion: attribute.data?.version,
        count: attribute.count
      })
    );
  // 缓存签名逐项比对 index / 属性引用 / version：源几何被原地改写时签名对不上，该条简化结果必须作废。
  const isRecordCurrent = record =>
    record.signature.every(signatureEntry => {
      const signatureAttribute =
        signatureEntry.name === "index"
          ? record.source.index
          : record.source.attributes[signatureEntry.name];
      return (
        signatureAttribute === signatureEntry.attribute &&
        signatureAttribute.version === signatureEntry.version &&
        signatureAttribute.data?.version === signatureEntry.dataVersion &&
        signatureAttribute.count === signatureEntry.count
      );
    });
  // 可简化的前提：网格显式声明了 reflectionSimplifiable，且材质为不透明实体。
  // 透明 / 镂空 / 位移 / 透射材质一旦减面，轮廓与折射效果会明显失真。
  const isSimplifiable = mesh => {
    const material = mesh.material;
    return (
      mesh.userData?.reflectionSimplifiable &&
      material &&
      !Array.isArray(material) &&
      !material.transparent &&
      !material.alphaTest &&
      !material.displacementMap &&
      !(material.transmission > 0)
    );
  };

  /**
   * 释放某个源几何对应的记录（含简化后的几何）。
   */
  function releaseRecord(sourceGeometry) {
    const existingRecord = recordByGeometry.get(sourceGeometry);
    if (existingRecord) {
      // 先摘掉 dispose 监听，避免 release 触发的 dispose 再次回调造成递归。
      sourceGeometry.removeEventListener("dispose", existingRecord.release);
      recordByGeometry.delete(sourceGeometry);
      recordById.delete(existingRecord.id);
      if (existingRecord.geometry) {
        existingRecord.geometry.dispose();
        // 统计量与缓存同步回退，保证 stats 始终反映当前占用。
        stats.bytes -= existingRecord.bytes;
        stats.prepared--;
        stats.sourceTriangles -= existingRecord.sourceTriangles;
        stats.detailTriangles -= existingRecord.detailTriangles;
      }
      stats.pending = recordById.size;
    }
  }

  /**
   * 保证 Worker 存在；创建失败则永久放弃这一功能。
   */
  function ensureWorker() {
    if (!worker && !isWorkerFailed) {
      try {
        worker = makeWorker();
        worker.onerror = () => {
          // Worker 整体崩溃：在飞的任务不可能再回包，统一计入失败并清空等待表。
          isWorkerFailed = true;
          stats.failed += recordById.size;
          recordById.clear();
          stats.pending = 0;
          worker.terminate();
          worker = null;
        };
        worker.onmessage = ({ data: message }) => {
          const pendingRecord = recordById.get(message.id);
          recordById.delete(message.id);
          stats.pending = recordById.size;
          // 记录已被释放，或控制器已经销毁：直接丢弃结果（回包是异步的，可能晚于释放）。
          if (!pendingRecord || isDisposed) {
            return;
          }
          // 期间几何被改写过，简化结果对不上新形状，连记录一起作废。
          if (!isRecordCurrent(pendingRecord)) {
            releaseRecord(pendingRecord.source);
            return;
          }
          if (message.failed) {
            stats.failed++;
            return;
          }
          // 简化后仍保留了九成以上的索引，说明这次减面几乎没效果，不值得占用缓存。
          if (message.indices.length >= pendingRecord.source.index.count * 0.9) {
            return;
          }
          const simplifiedGeometry = pendingRecord.source.clone();
          simplifiedGeometry.setIndex(new THREE.BufferAttribute(message.indices, 1));
          const byteLength = Object.values(simplifiedGeometry.attributes).reduce(
            (accumulatedBytes, attributeArray) =>
              accumulatedBytes + attributeArray.array.byteLength,
            simplifiedGeometry.index.array.byteLength
          );
          // 超过总预算就不再收新几何：宁可少一层细节，也不让反射把内存吃满。
          if (stats.bytes + byteLength > MAX_DETAIL_BYTE_BUDGET) {
            simplifiedGeometry.dispose();
            return;
          }
          pendingRecord.geometry = simplifiedGeometry;
          pendingRecord.bytes = byteLength;
          stats.bytes += byteLength;
          stats.prepared++;
          pendingRecord.sourceTriangles = pendingRecord.source.index.count / 3;
          pendingRecord.detailTriangles = message.indices.length / 3;
          stats.sourceTriangles += pendingRecord.sourceTriangles;
          stats.detailTriangles += pendingRecord.detailTriangles;
          // 有新的低模可用，请求下一帧重绘让反射立刻用上。
          requestFrame();
        };
      } catch {
        // 构造 Worker 就抛错（CSP、脚本缺失）时只累计一次失败，不影响主流程。
        isWorkerFailed = true;
        stats.failed++;
      }
    }
  }

  /**
   * 扫描场景，把值得减面的网格提交给 Worker。
   */
  function prepare(root) {
    if (!isDisposed && !isWorkerFailed) {
      root.traverse(node => {
        const nodeGeometry = node.geometry;
        // 少于 900 个三角形的小网格：通信与打包的开销大于减面带来的收益，跳过。
        if (
          !isSimplifiable(node) ||
          !nodeGeometry?.index ||
          !nodeGeometry.attributes.position ||
          nodeGeometry.index.count < 900
        ) {
          return;
        }
        const staleRecord = recordByGeometry.get(nodeGeometry);
        if (staleRecord && !isRecordCurrent(staleRecord)) {
          releaseRecord(nodeGeometry);
        }
        // 已有有效记录就跳过；ensureWorker() 放在条件里是为了「没有 Worker 时不建记录」。
        if (recordByGeometry.has(nodeGeometry) || (ensureWorker(), !worker)) {
          return;
        }
        // 属性打包：InterleavedBufferAttribute 等带 offset / stride 的视图无法直接转移，
        // 这里统一读成紧凑的 Float32Array 再发出去。
        const attributeNames = ["position", "normal", "color", "uv"].filter(
          attributeName => nodeGeometry.attributes[attributeName]
        );
        const packedAttributes = Object.fromEntries(
          attributeNames.map(sourceAttributeName => {
            const sourceAttribute = nodeGeometry.attributes[sourceAttributeName];
            const packedData = new Float32Array(sourceAttribute.count * sourceAttribute.itemSize);
            const accessors = ["getX", "getY", "getZ", "getW"];
            for (
              let packedVertexIndex = 0;
              packedVertexIndex < sourceAttribute.count;
              packedVertexIndex++
            ) {
              for (
                let packedComponentIndex = 0;
                packedComponentIndex < sourceAttribute.itemSize;
                packedComponentIndex++
              ) {
                packedData[packedVertexIndex * sourceAttribute.itemSize + packedComponentIndex] =
                  sourceAttribute[accessors[packedComponentIndex]](packedVertexIndex);
              }
            }
            return [sourceAttributeName, packedData];
          })
        );
        // 非 position 的属性交错成一份 buffer（Worker 侧的 stride / weights 与之对应）。
        const extraAttributeNames = attributeNames.filter(
          extraAttributeName => extraAttributeName !== "position"
        );
        const stride = extraAttributeNames.reduce(
          (accumulatedSize, extraName) =>
            accumulatedSize + nodeGeometry.attributes[extraName].itemSize,
          0
        );
        const interleavedAttributes = new Float32Array(
          nodeGeometry.attributes.position.count * stride
        );
        const weights = [];
        let attributeOffset = 0;
        for (const attributeKey of extraAttributeNames) {
          const itemSize = nodeGeometry.attributes[attributeKey].itemSize;
          // 误差权重：法线 0.2（偏平表面看不出变化）、颜色 1、其余（UV）2。
          // UV 权重最高，因为贴图接缝在反射里最容易露馅。
          for (let componentIndex = 0; componentIndex < itemSize; componentIndex++) {
            weights.push(attributeKey === "normal" ? 0.2 : attributeKey === "color" ? 1 : 2);
          }
          for (
            let vertexIndex = 0;
            vertexIndex < nodeGeometry.attributes.position.count;
            vertexIndex++
          ) {
            interleavedAttributes.set(
              packedAttributes[attributeKey].subarray(
                vertexIndex * itemSize,
                (vertexIndex + 1) * itemSize
              ),
              vertexIndex * stride + attributeOffset
            );
          }
          attributeOffset += itemSize;
        }
        const recordId = ++recordIdSequence;
        const recordEntry = {
          id: recordId,
          source: nodeGeometry,
          signature: buildAttributeSignature(nodeGeometry),
          geometry: null,
          bytes: 0,
          // 源几何被释放（模型卸载）时自动清掉对应记录。
          release: () => releaseRecord(nodeGeometry)
        };
        nodeGeometry.addEventListener("dispose", recordEntry.release);
        recordByGeometry.set(nodeGeometry, recordEntry);
        recordById.set(recordId, recordEntry);
        stats.pending = recordById.size;
        // 索引拷一份成 Uint32：buffer 即将被转移给 Worker，转移后主线程不能再访问它。
        const indexArray = new Uint32Array(nodeGeometry.index.array);
        const positionData = packedAttributes.position;
        const worldScale = new THREE.Vector3();
        node.getWorldScale(worldScale);
        try {
          worker.postMessage(
            {
              id: recordId,
              indices: indexArray,
              positions: positionData,
              attributes: interleavedAttributes,
              stride: stride,
              weights: weights,
              // 误差预算按世界缩放折算：缩放越大允许的绝对误差越大，
              // 这样不同尺寸的物件在屏幕上的锯齿感才一致；0.001 兜底防止除零。
              error:
                0.01 /
                Math.max(
                  Math.abs(worldScale.x),
                  Math.abs(worldScale.y),
                  Math.abs(worldScale.z),
                  0.001
                )
            },
            [indexArray.buffer, positionData.buffer, interleavedAttributes.buffer]
          );
        } catch {
          // 序列化失败（例如已转移过的 buffer）时把记录撤掉，避免永远停留在 pending。
          recordById.delete(recordId);
          stats.pending = recordById.size;
          stats.failed++;
        }
      });
    }
  }
  return {
    stats: stats,
    prepare: prepare,
    get: candidateMesh => {
      // 材质变得不可简化（例如刚被改成半透明）时不再使用缓存，反射回退到原网格。
      if (!isSimplifiable(candidateMesh)) {
        return null;
      }
      const cachedRecord = recordByGeometry.get(candidateMesh.geometry);
      if (cachedRecord && isRecordCurrent(cachedRecord)) {
        return cachedRecord.geometry;
      } else {
        return null;
      }
    },
    dispose() {
      isDisposed = true;
      worker?.terminate();
      // 复制一份 key 再遍历：releaseRecord 会修改原 Map。
      for (const cachedGeometry of [...recordByGeometry.keys()]) {
        releaseRecord(cachedGeometry);
      }
    }
  };
}
