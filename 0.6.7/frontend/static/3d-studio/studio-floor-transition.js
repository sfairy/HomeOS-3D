export function createFloorTransition({
  THREE: arg1,
  getRoot: arg2,
  dispose: arg3,
  release: arg4 = () => false,
  suspendReflections: arg5 = () => {},
  invalidate: arg6 = () => {},
}) {
  let list1 = [],
    value1 = false,
    value2 = null,
    value3 = null,
    value4 = null;
  const fn1 = (arg7) => {
      const value5 = new arg1.Vector3(),
        value6 = new arg1.Quaternion(),
        value7 = new arg1.Vector3();
      return (
        arg7.decompose(value5, value6, value7),
        {
          position: value5,
          quaternion: value6,
          scale: value7,
        }
      );
    },
    fn2 = (arg8) => {
      const value8 = arg8.isInstancedMesh ? arg8 : arg8.geometry;
      return (value8.boundingBox || value8.computeBoundingBox(), value8.boundingBox);
    };
  function fn3(arg9, arg10, arg11) {
    const value9 = arg2();
    return (
      value9.updateMatrixWorld(true),
      arg9.map((arg12) => {
        const value10 = new arg1.Group();
        ((value10.name = "floor-transition-" + arg12),
          (value10.userData.floorId = value10.userData.regionFloorId = arg12));
        const value11 = arg11
          ? value9.children.filter((arg13) => arg13.userData.floorId === arg12)
          : [...value9.children];
        value9.add(value10);
        for (const value12 of value11) value10.attach(value12);
        const object1 = {
          id: arg12,
          node: value10,
          baseFrame: arg10(arg12),
          ground: [],
          groundAlpha: 1,
        };
        return (
          value10.traverse((arg14) => {
            if (
              !arg14.material ||
              !["background", "grid", "contact-shadow"].includes(arg14.userData?.exportRole)
            )
              return;
            const value13 = arg14.material,
              fn15 = (arg15) => {
                const value14 = arg15.clone();
                return (
                  (value14.onBeforeCompile = arg15.onBeforeCompile),
                  (value14.customProgramCacheKey = arg15.customProgramCacheKey.bind(arg15)),
                  (value14.transparent = true),
                  (value14.depthWrite = false),
                  value14
                );
              };
            ((arg14.material = Array.isArray(value13) ? value13.map(fn15) : fn15(value13)),
              object1.ground.push({
                node: arg14,
                followsFloor: arg14.userData.exportRole === "contact-shadow",
                original: value13,
                materials: Array.isArray(arg14.material) ? arg14.material : [arg14.material],
                opacity: (Array.isArray(value13) ? value13 : [value13]).map(
                  (arg16) => arg16.opacity,
                ),
              }));
          }),
          object1
        );
      })
    );
  }
  function fn4(arg17) {
    return (arg17.node.updateMatrix(), arg17.node.matrix.clone().multiply(arg17.baseFrame));
  }
  function fn5(arg18) {
    for (const value15 of arg18.ground) {
      value15.node.material = value15.original;
      for (const value16 of value15.materials) value16.dispose();
    }
    arg18.ground = [];
  }
  function fn6(arg19, arg20 = true) {
    (fn5(arg19),
      arg19.node.removeFromParent(),
      !arg19.transferred && !(arg20 && arg4(arg19)) && arg3(arg19.node));
  }
  function fn7(arg21, arg22) {
    fn5(arg21);
    const list2 = [...arg21.node.children];
    let value17;
    if (list2.length === 1 && list2[0].userData.floorId === arg21.id)
      ((value17 = list2[0]), arg21.node.remove(value17));
    else {
      ((value17 = new arg1.Group()),
        (value17.name = "floor-" + arg21.id),
        (value17.userData.floorId = value17.userData.regionFloorId = arg21.id));
      for (const value18 of list2) (arg21.node.remove(value18), value17.add(value18));
    }
    return (
      value17.applyMatrix4(arg22.clone().multiply(arg21.baseFrame.clone().invert())),
      arg2().add(value17),
      value17.updateMatrixWorld(true),
      (arg21.transferred = true),
      value17
    );
  }
  function fn8(arg23, arg24, arg25) {
    arg5(true);
    const value19 = value1 ? list1 : fn3(arg23, arg24, arg25);
    for (const value20 of value19)
      ((value20.frame = fn4(value20)), value20.node.removeFromParent());
    return (
      (list1 = []),
      (value1 = false),
      (value2 = null),
      (value3 = null),
      (value4 = null),
      value19
    );
  }
  function fn9(arg26, arg27, arg28, arg29, arg30 = false, arg31 = null, arg32 = null) {
    const value21 = arg2(),
      map1 = new Map(arg26.map((arg33) => [arg33.id, arg33])),
      map2 = new Map(arg27.map((arg34) => [arg34.id, arg34])),
      value22 =
        arg27.find((arg35) => arg35.id === arg32) ||
        arg27.find((arg36) => map1.get(arg36.id)?.keep) ||
        arg27.find((arg37) => map1.has(arg37.id)) ||
        arg27[0],
      value23 = map1.get(value22.id) || arg26[0],
      value24 =
        !arg30 && arg27.length > 1
          ? value23.frame.clone().multiply(value22.baseFrame.clone().invert())
          : null;
    ((value4 = value24 ? fn1(value24) : null), value4 && (value4.anchorId = value22.id));
    const value25 = arg26.find((arg38) => arg38.keep) || arg26[0],
      fn16 = (arg39) => arg28.indexOf(arg39),
      value26 = arg26.find((arg40) => Number.isFinite(arg40.scrollPosition)),
      fn17 = (arg41, arg42) => {
        const value27 = arg41.clone(),
          value28 = arg42 * arg29,
          value29 = arg30 && arg31 ? arg31 : new arg1.Vector3(0, 1, 0);
        return (
          (value27.elements[12] += value29.x * value28),
          (value27.elements[13] += value29.y * value28),
          (value27.elements[14] += value29.z * value28),
          value27
        );
      };
    list1 = [];
    for (const value30 of arg27) {
      const value31 = map1.get(value30.id),
        value32 = value31?.frame || fn17(value23.frame, fn16(value30.id) - fn16(value23.id));
      value30.assemblyOffset =
        !value31 && value24 ? (fn16(value30.id) - fn16(value22.id)) * arg29 : null;
      const value33 =
        value30.assemblyOffset !== null
          ? value24
              .clone()
              .multiply(new arg1.Matrix4().makeTranslation(0, value30.assemblyOffset, 0))
          : value32.clone().multiply(value30.baseFrame.clone().invert());
      ((value30.assemblyRelative = value24
        ? fn1(value24.clone().invert().multiply(value33))
        : null),
        value33.decompose(value30.node.position, value30.node.quaternion, value30.node.scale),
        (value30.scrollOffset = value31?.scrollOffset),
        (value30.wasVisible = !!value31),
        (value30.from = fn1(value33)),
        (value30.to = fn1(new arg1.Matrix4())),
        (value30.keep = !arg30 || value30.id === value22.id),
        (value30.node.userData.floorTransitionLeaving = !value30.keep),
        (value30.groundFrom = value31?.groundAlpha ?? 0),
        (value30.groundTo = value30.keep ? 1 : 0),
        list1.push(value30),
        value31 && fn6(value31, false));
    }
    for (const value34 of arg26) {
      if (map2.has(value34.id)) continue;
      value21.add(value34.node);
      const value35 = fn17(value22.baseFrame, fn16(value34.id) - fn16(value22.id));
      ((value34.from = fn1(value34.node.matrix)),
        (value34.to = fn1(value35.multiply(value34.baseFrame.clone().invert()))),
        (value34.keep = false),
        (value34.node.userData.floorTransitionLeaving = true),
        (value34.wasVisible = true),
        (value34.groundFrom = value34.groundAlpha),
        (value34.groundTo = 0),
        list1.push(value34));
    }
    if (
      ((value2 = arg30
        ? {
            spread: value26?.scrollSpacing || arg29,
            order: [...arg28],
            screenSpacing: value26?.scrollScreenSpacing,
            scrollFrom: value26?.scrollPosition ?? fn16(value25.id),
            scrollTo: fn16(value22.id),
          }
        : null),
      (value3 =
        !arg30 && arg27.length === 1
          ? {
              target: value22.id,
              order: [...arg28],
            }
          : null),
      !value2)
    ) {
      for (const value36 of list1)
        (delete value36.scrollPosition,
          delete value36.scrollSpacing,
          delete value36.scrollScreenSpacing,
          delete value36.scrollOffset);
    }
    for (const value37 of list1)
      value37.departureEase = !arg30 && arg27.length === 1 && !value37.keep;
    ((value1 = true), arg5(true), fn14(0));
  }
  function fn10() {
    if (!value1 && !list1.length) return;
    const value38 = arg2();
    for (const value39 of list1)
      if (value39.keep && value39.node.parent === value38) {
        (value39.node.position.set(0, 0, 0),
          value39.node.quaternion.identity(),
          value39.node.scale.set(1, 1, 1),
          value39.node.updateMatrixWorld(true),
          fn5(value39));
        for (const value40 of [...value39.node.children]) value38.attach(value40);
        value39.node.removeFromParent();
      } else fn6(value39);
    ((list1 = []),
      (value1 = false),
      (value2 = null),
      (value3 = null),
      (value4 = null),
      arg5(false),
      arg6(true));
  }
  const fn11 = (arg43) => {
    const value41 = new arg1.Vector3().fromArray(arg43.position),
      value42 = new arg1.Vector3().fromArray(arg43.target);
    return new arg1.Matrix4()
      .lookAt(value41, value42, new arg1.Vector3().fromArray(arg43.up || [0, 1, 0]))
      .setPosition(value41);
  };
  function fn12(arg44, arg45, arg46 = null) {
    if (value4 && arg46) {
      const value44 = fn11(arg44).invert(),
        value45 = fn11(arg45).invert(),
        value46 = list1.find((arg47) => arg47.id === value4.anchorId),
        map3 = new Map(
          list1.map((arg48) => {
            const value48 = new arg1.Box3();
            arg48.node.updateWorldMatrix(true, true);
            const value49 = arg48.node.matrixWorld.clone().invert();
            return (
              arg48.node.traverseVisible((arg49) => {
                if (
                  !arg49.isMesh ||
                  !arg49.geometry ||
                  ["background", "grid", "contact-shadow"].includes(arg49.userData?.exportRole)
                )
                  return;
                const value50 = fn2(arg49);
                value50 &&
                  value48.union(
                    value50.clone().applyMatrix4(value49.clone().multiply(arg49.matrixWorld)),
                  );
              }),
              [
                arg48.id,
                value48.isEmpty()
                  ? new arg1.Vector3().setFromMatrixPosition(arg48.baseFrame)
                  : value48.getCenter(new arg1.Vector3()),
              ]
            );
          }),
        ),
        value47 = map3
          .get(value46.id)
          .clone()
          .applyMatrix4(
            new arg1.Matrix4().compose(
              value46.from.position,
              value46.from.quaternion,
              value46.from.scale,
            ),
          )
          .applyMatrix4(value44);
      for (const value51 of list1) {
        const value52 = map3.get(value51.id),
          value53 = value44
            .clone()
            .multiply(
              new arg1.Matrix4().compose(
                value51.from.position,
                value51.from.quaternion,
                value51.from.scale,
              ),
            ),
          value54 = value45.clone(),
          value55 = value52.clone().applyMatrix4(value53),
          value56 = value52.clone().applyMatrix4(value54);
        if (!value51.wasVisible) {
          const value59 = fn13(arg46.from, -value47.z),
            value60 =
              (value51.assemblyOffset / Math.max(0.001, Math.abs(value51.assemblyOffset))) * 1.8;
          (value55.copy(value47), (value55.y += value60 * value59));
          const value61 = list1.filter(
            (arg50) =>
              !arg50.wasVisible &&
              Math.sign(arg50.assemblyOffset) === Math.sign(value51.assemblyOffset) &&
              Math.abs(arg50.assemblyOffset) < Math.abs(value51.assemblyOffset),
          ).length;
          value55.y += value60 * value59 * value61;
        }
        const fn20 = (arg51, arg52) => {
            const value62 = fn13(arg52, -arg51.z);
            return new arg1.Vector3(arg51.x / value62, arg51.y / value62, -arg51.z);
          },
          value57 = fn20(value55, arg46.from),
          value58 = fn20(value56, arg46.to);
        (value51.wasVisible || (value57.x = value58.x),
          (value51.assemblyScreen = {
            pivot: value52,
            from: fn1(value51.wasVisible ? value53 : value54),
            to: fn1(value54),
            start: value57,
            end: value58,
          }));
      }
      return;
    }
    if (!value2) {
      if (!value3 || !arg46) return;
      const value63 = fn11(arg44).invert();
      for (const value64 of list1) {
        if (value64.keep) continue;
        const value65 = value63
            .clone()
            .multiply(
              new arg1.Matrix4().compose(
                value64.from.position,
                value64.from.quaternion,
                value64.from.scale,
              ),
            ),
          value66 = Math.sign(
            value3.order.indexOf(value64.id) - value3.order.indexOf(value3.target),
          );
        let value67 = 0;
        value64.node.updateWorldMatrix(true, true);
        const value68 = value64.node.matrixWorld.clone().invert();
        (value64.node.traverseVisible((arg53) => {
          if (
            !arg53.isMesh ||
            !arg53.geometry ||
            ["background", "grid", "contact-shadow"].includes(arg53.userData?.exportRole)
          )
            return;
          const value69 = fn2(arg53);
          if (!value69 || value69.isEmpty()) return;
          const value70 = value65.clone().multiply(value68).multiply(arg53.matrixWorld);
          for (const value71 of [value69.min.x, value69.max.x])
            for (const value72 of [value69.min.y, value69.max.y])
              for (const value73 of [value69.min.z, value69.max.z]) {
                const value74 = new arg1.Vector3(value71, value72, value73).applyMatrix4(value70);
                for (const value75 of [arg46.from, arg46.to]) {
                  const value76 =
                    (value75.height *
                      (1 -
                        value75.weight +
                        (value75.weight * Math.max(0.001, -value74.z)) /
                          Math.max(0.001, value75.distance))) /
                    2;
                  value67 = Math.max(value67, value76 * 1.12 - value66 * value74.y);
                }
              }
        }),
          (value64.exitFrom = fn1(value65)),
          (value65.elements[13] += value66 * value67),
          (value64.exitTo = fn1(value65)));
      }
      return;
    }
    ((value2.from = fn11(arg44).invert()),
      (value2.to = fn11(arg45).invert()),
      (value2.projected = !!arg46),
      (value2.projections = arg46));
    const fn18 = (arg54, arg55) => new arg1.Matrix4().makeTranslation(0, arg55, 0).multiply(arg54),
      fn19 = (arg56, arg57) =>
        Math.max(
          0.001,
          (arg56.height *
            (1 -
              arg56.weight +
              (arg56.weight * Math.max(0.001, -arg57)) / Math.max(0.001, arg56.distance))) /
            2,
        ),
      value43 = list1.map((arg58) => {
        const value77 = value2.from
          .clone()
          .multiply(
            new arg1.Matrix4().compose(
              arg58.from.position,
              arg58.from.quaternion,
              arg58.from.scale,
            ),
          );
        if (!arg46)
          return {
            r: arg58,
            current: value77,
          };
        arg58.node.updateWorldMatrix(true, true);
        const value78 = arg58.node.matrixWorld.clone().invert(),
          value79 = new arg1.Box3(),
          list3 = [];
        (arg58.node.traverseVisible((arg59) => {
          if (
            !arg59.isMesh ||
            !arg59.geometry ||
            ["background", "grid", "contact-shadow"].includes(arg59.userData?.exportRole)
          )
            return;
          const value81 = fn2(arg59);
          if (value81 && !value81.isEmpty()) {
            const value82 = value78.clone().multiply(arg59.matrixWorld);
            value79.union(value81.clone().applyMatrix4(value82));
            for (const value83 of [value81.min.x, value81.max.x])
              for (const value84 of [value81.min.y, value81.max.y])
                for (const value85 of [value81.min.z, value81.max.z])
                  list3.push(new arg1.Vector3(value83, value84, value85).applyMatrix4(value82));
          }
        }),
          (arg58.scrollCenter = value79.isEmpty()
            ? new arg1.Vector3()
            : value79.getCenter(new arg1.Vector3())),
          (arg58.projectionFrom = arg58.wasVisible ? arg46.from : arg46.to),
          (arg58.projectionTo = arg58.keep || !arg58.wasVisible ? arg46.to : arg46.from));
        let value80 = 0;
        if (!value79.isEmpty()) {
          for (const [value86, value87] of [
            [arg58.wasVisible ? value77 : value2.to, arg58.projectionFrom],
            [arg58.keep || !arg58.wasVisible ? value2.to : value77, arg58.projectionTo],
          ])
            for (const value88 of list3) {
              const value89 = value88.clone().applyMatrix4(value86),
                value90 = value2.order.indexOf(arg58.id),
                value91 =
                  value90 === 0
                    ? value89.y
                    : value90 === value2.order.length - 1
                      ? -value89.y
                      : Math.abs(value89.y);
              value80 = Math.max(value80, value91 / fn19(value87, value89.z));
            }
        }
        return (
          (arg58.scrollExitExtent = value80),
          {
            r: arg58,
            current: value77,
            extent: value80,
            corners: list3,
          }
        );
      });
    arg46 &&
      !Number.isFinite(value2.screenSpacing) &&
      (value2.screenSpacing = Math.min(
        1.8,
        Math.max(1.24, ...value43.map((arg60) => 1 + arg60.extent + 0.24)),
      ));
    for (const { r: value92, current: value93, corners: value94 } of value43) {
      const value95 = value2.order.indexOf(value92.id);
      if (arg46) {
        if (
          ((value92.independentDeparture =
            !value92.keep &&
            value92.wasVisible &&
            (value95 - value2.scrollTo) * (value2.scrollTo - value2.scrollFrom) > 0),
          value92.wasVisible)
        ) {
          const value96 = value92.scrollCenter.clone().applyMatrix4(value93);
          value93.elements[13] -=
            (value95 - value2.scrollFrom) * value2.screenSpacing * fn19(arg46.from, value96.z);
        }
        if (
          ((value92.slideFrom = fn1(value92.wasVisible ? value93 : value2.to)),
          (value92.slideTo = fn1(value92.keep || !value92.wasVisible ? value2.to : value93)),
          !value92.keep)
        ) {
          const value97 = new arg1.Matrix4().compose(
              value92.slideTo.position,
              value92.slideTo.quaternion,
              value92.slideTo.scale,
            ),
            value98 = -value92.scrollCenter.clone().applyMatrix4(value97).z,
            value99 = fn19(arg46.to, -value98),
            value100 = value99 / fn19(value92.projectionTo, -value98);
          (value97.premultiply(new arg1.Matrix4().makeScale(value100, value100, value100)),
            (value97.elements[14] += value98 * (value100 - 1)));
          const value101 = value92.independentDeparture ? value2.scrollFrom : value2.scrollTo;
          value97.elements[13] += (value95 - value101) * value2.screenSpacing * value99;
          const value102 = Math.sign(value95 - value2.scrollTo),
            value103 = value92.independentDeparture
              ? 0
              : Math.abs(value2.scrollTo - value2.scrollFrom) * value2.screenSpacing * 0.1;
          value92.scrollExitExtra = Math.max(
            0,
            ...value94.map((arg61) => {
              const value104 = arg61.clone().applyMatrix4(value97);
              return (
                (1.14 * fn19(arg46.to, value104.z) - value102 * value104.y) / value99 + value103
              );
            }),
          );
        }
      } else
        ((value92.slideFrom = fn1(
          value92.wasVisible
            ? value93
            : fn18(value2.to, (value95 - value2.scrollFrom) * value2.spread),
        )),
          (value92.slideTo = fn1(
            value92.keep
              ? value2.to
              : value92.wasVisible
                ? fn18(value93, (value2.scrollFrom - value2.scrollTo) * value2.spread)
                : fn18(value2.to, (value95 - value2.scrollTo) * value2.spread),
          )));
    }
  }
  function fn13(arg62, arg63) {
    return Math.max(
      0.001,
      (arg62.height *
        (1 -
          arg62.weight +
          (arg62.weight * Math.max(0.001, arg63)) / Math.max(0.001, arg62.distance))) /
        2,
    );
  }
  function fn14(arg64, arg65 = null, arg66 = null) {
    if (!value1) return;
    if (list1.some((arg67) => arg67.keep && arg67.node.parent !== arg2())) {
      fn10();
      return;
    }
    const value105 = Math.max(0, Math.min(1, arg64));
    if (!arg66 && value2?.projections) {
      const { from: value106, to: value107 } = value2.projections;
      arg66 = Object.fromEntries(
        ["height", "weight", "distance"].map((arg68) => [
          arg68,
          value106[arg68] + (value107[arg68] - value106[arg68]) * value105,
        ]),
      );
    }
    for (const value108 of list1) {
      if (
        (value2 &&
          ((value108.scrollPosition =
            value2.scrollFrom + (value2.scrollTo - value2.scrollFrom) * value105),
          (value108.scrollSpacing = value2.spread),
          (value108.scrollScreenSpacing = value2.screenSpacing)),
        value4 && value108.assemblyScreen && arg65 && arg66)
      ) {
        const value109 = value108.assemblyScreen,
          value110 = value109.start.clone().lerp(value109.end, value105),
          value111 = fn13(arg66, value110.z),
          value112 = new arg1.Matrix4().compose(
            new arg1.Vector3(),
            new arg1.Quaternion().slerpQuaternions(
              value109.from.quaternion,
              value109.to.quaternion,
              value105,
            ),
            value109.from.scale.clone().lerp(value109.to.scale, value105),
          ),
          value113 = value109.pivot.clone().applyMatrix4(value112);
        (value112.setPosition(
          new arg1.Vector3(value110.x * value111, value110.y * value111, -value110.z).sub(value113),
        ),
          fn11(arg65)
            .multiply(value112)
            .decompose(value108.node.position, value108.node.quaternion, value108.node.scale));
      } else {
        if (value4 && value108.assemblyRelative) {
          const value114 = value108.assemblyRelative,
            value115 = 1 - (1 - value105) * (1 - value105),
            value116 = new arg1.Matrix4().compose(
              new arg1.Vector3(
                value114.position.x * (1 - value115),
                value114.position.y * (1 - value105),
                value114.position.z * (1 - value115),
              ),
              new arg1.Quaternion().slerpQuaternions(
                value114.quaternion,
                new arg1.Quaternion(),
                value115,
              ),
              new arg1.Vector3().lerpVectors(value114.scale, new arg1.Vector3(1, 1, 1), value115),
            );
          new arg1.Matrix4()
            .compose(
              value4.position.clone().multiplyScalar(1 - value105),
              new arg1.Quaternion().slerpQuaternions(
                value4.quaternion,
                new arg1.Quaternion(),
                value105,
              ),
              new arg1.Vector3().lerpVectors(value4.scale, new arg1.Vector3(1, 1, 1), value105),
            )
            .multiply(value116)
            .decompose(value108.node.position, value108.node.quaternion, value108.node.scale);
        } else {
          if (value3 && !value108.keep && value108.exitFrom && arg65) {
            const value117 = value105 * value105,
              value118 = new arg1.Matrix4().compose(
                new arg1.Vector3().lerpVectors(
                  value108.exitFrom.position,
                  value108.exitTo.position,
                  value117,
                ),
                value108.exitFrom.quaternion,
                value108.exitFrom.scale,
              );
            fn11(arg65)
              .multiply(value118)
              .decompose(value108.node.position, value108.node.quaternion, value108.node.scale);
          } else {
            if (value2?.from && arg65) {
              const value119 = new arg1.Matrix4().compose(
                new arg1.Vector3().lerpVectors(
                  value108.slideFrom.position,
                  value108.slideTo.position,
                  value105,
                ),
                new arg1.Quaternion().slerpQuaternions(
                  value108.slideFrom.quaternion,
                  value108.slideTo.quaternion,
                  value105,
                ),
                new arg1.Vector3().lerpVectors(
                  value108.slideFrom.scale,
                  value108.slideTo.scale,
                  value105,
                ),
              );
              if (value2.projected && arg66) {
                const value120 = -value108.scrollCenter.clone().applyMatrix4(value119).z,
                  value121 =
                    (arg66.height *
                      (1 -
                        arg66.weight +
                        (arg66.weight * Math.max(0.001, value120)) /
                          Math.max(0.001, arg66.distance))) /
                    2,
                  value122 = Object.fromEntries(
                    ["height", "weight", "distance"].map((arg69) => [
                      arg69,
                      value108.projectionFrom[arg69] +
                        (value108.projectionTo[arg69] - value108.projectionFrom[arg69]) * value105,
                    ]),
                  ),
                  value123 =
                    (value122.height *
                      (1 -
                        value122.weight +
                        (value122.weight * Math.max(0.001, value120)) /
                          Math.max(0.001, value122.distance))) /
                    2,
                  value124 = value121 / Math.max(0.001, value123);
                (value119.premultiply(new arg1.Matrix4().makeScale(value124, value124, value124)),
                  (value119.elements[14] += value120 * (value124 - 1)));
                const value125 = value108.independentDeparture
                  ? value2.scrollFrom
                  : value108.scrollPosition;
                if (
                  ((value108.scrollOffset =
                    (value2.order.indexOf(value108.id) - value125) *
                    value2.screenSpacing *
                    value121),
                  (value119.elements[13] += value108.scrollOffset),
                  !value108.keep)
                ) {
                  const value126 = Math.sign(value2.order.indexOf(value108.id) - value2.scrollTo),
                    value127 =
                      value108.scrollExitExtra ??
                      Math.max(
                        0,
                        1.14 +
                          (value108.scrollExitExtent || 0) -
                          Math.abs(value2.order.indexOf(value108.id) - value2.scrollTo) *
                            value2.screenSpacing,
                      ),
                    value128 = Math.max(
                      0,
                      Math.min(
                        1,
                        value108.independentDeparture ? value105 / 0.88 : (value105 - 0.65) / 0.23,
                      ),
                    );
                  value119.elements[13] +=
                    value126 * value127 * value121 * value128 * value128 * (3 - 2 * value128);
                }
              }
              fn11(arg65)
                .multiply(value119)
                .decompose(value108.node.position, value108.node.quaternion, value108.node.scale);
            } else {
              const value129 = value108.departureEase ? value105 * value105 : value105;
              (value108.node.position.lerpVectors(
                value108.from.position,
                value108.to.position,
                value129,
              ),
                value108.node.quaternion.slerpQuaternions(
                  value108.from.quaternion,
                  value108.to.quaternion,
                  value129,
                ),
                value108.node.scale.lerpVectors(value108.from.scale, value108.to.scale, value129));
            }
          }
        }
      }
      (value108.node.updateMatrixWorld(true),
        (value108.groundAlpha =
          value108.groundFrom + (value108.groundTo - value108.groundFrom) * value105));
      for (const value130 of value108.ground)
        value130.materials.forEach((arg70, arg71) => {
          arg70.opacity =
            value130.opacity[arg71] * (value130.followsFloor ? 1 : value108.groundAlpha);
        });
    }
    (arg6(false), value105 === 1 && fn10());
  }
  return {
    capture: fn3,
    take: fn8,
    reuse: fn7,
    begin: fn9,
    sample: fn14,
    setSlideCameras: fn12,
    finish: fn10,
    get active() {
      return value1;
    },
    get records() {
      return list1;
    },
  };
}
