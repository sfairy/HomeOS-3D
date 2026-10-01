import {
  Controls,
  MOUSE,
  Quaternion,
  Spherical,
  TOUCH,
  Vector2,
  Vector3,
  Plane,
  Ray,
  MathUtils,
} from "./three.module.min.js";
const S = {
    type: "change",
  },
  P = {
    type: "start",
  },
  w = {
    type: "end",
  },
  b = new Ray(),
  O = new Plane(),
  L = Math.cos(70 * MathUtils.DEG2RAD),
  h = new Vector3(),
  r = 2 * Math.PI,
  o = {
    NONE: -1,
    ROTATE: 0,
    DOLLY: 1,
    PAN: 2,
    TOUCH_ROTATE: 3,
    TOUCH_PAN: 4,
    TOUCH_DOLLY_PAN: 5,
    TOUCH_DOLLY_ROTATE: 6,
  },
  g = 0.000001;
class x extends Controls {
  constructor(arg1, arg2 = null) {
    (super(arg1, arg2),
      (this.state = o.NONE),
      (this.target = new Vector3()),
      (this.cursor = new Vector3()),
      (this.minDistance = 0),
      (this.maxDistance = 1 / 0),
      (this.minZoom = 0),
      (this.maxZoom = 1 / 0),
      (this.minTargetRadius = 0),
      (this.maxTargetRadius = 1 / 0),
      (this.minPolarAngle = 0),
      (this.maxPolarAngle = Math.PI),
      (this.minAzimuthAngle = -1 / 0),
      (this.maxAzimuthAngle = 1 / 0),
      (this.enableDamping = false),
      (this.dampingFactor = 0.05),
      (this.rotateSmoothing = 0),
      (this.rotateSmoothingThreshold = g),
      (this.enableZoom = true),
      (this.zoomSpeed = 1),
      (this.enableRotate = true),
      (this.rotateSpeed = 1),
      (this.keyRotateSpeed = 1),
      (this.enablePan = true),
      (this.panSpeed = 1),
      (this.screenSpacePanning = true),
      (this.keyPanSpeed = 7),
      (this.zoomToCursor = false),
      (this.autoRotate = false),
      (this.autoRotateSpeed = 2),
      (this.keys = {
        LEFT: "ArrowLeft",
        UP: "ArrowUp",
        RIGHT: "ArrowRight",
        BOTTOM: "ArrowDown",
      }),
      (this.mouseButtons = {
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.PAN,
      }),
      (this.touches = {
        ONE: TOUCH.ROTATE,
        TWO: TOUCH.DOLLY_PAN,
      }),
      (this.target0 = this.target.clone()),
      (this.position0 = this.object.position.clone()),
      (this.zoom0 = this.object.zoom),
      (this._domElementKeyEvents = null),
      (this._lastPosition = new Vector3()),
      (this._lastQuaternion = new Quaternion()),
      (this._lastTargetPosition = new Vector3()),
      (this._quat = new Quaternion().setFromUnitVectors(arg1.up, new Vector3(0, 1, 0))),
      (this._quatInverse = this._quat.clone().invert()),
      (this._spherical = new Spherical()),
      (this._sphericalDelta = new Spherical()),
      (this._scale = 1),
      (this._panOffset = new Vector3()),
      (this._rotateStart = new Vector2()),
      (this._rotateEnd = new Vector2()),
      (this._rotateDelta = new Vector2()),
      (this._panStart = new Vector2()),
      (this._panEnd = new Vector2()),
      (this._panDelta = new Vector2()),
      (this._dollyStart = new Vector2()),
      (this._dollyEnd = new Vector2()),
      (this._dollyDelta = new Vector2()),
      (this._dollyDirection = new Vector3()),
      (this._mouse = new Vector2()),
      (this._performCursorZoom = false),
      (this._pointers = []),
      (this._pointerPositions = {}),
      (this.touchDragThreshold = 0),
      (this._pendingTouch = null),
      (this._controlActive = false),
      (this._onPointerMove = C.bind(this)),
      (this._onPointerDown = k.bind(this)),
      (this._onPointerUp = N.bind(this)),
      (this._onContextMenu = H.bind(this)),
      (this._onMouseWheel = U.bind(this)),
      (this._onKeyDown = Z.bind(this)),
      (this._onTouchStart = z.bind(this)),
      (this._onTouchMove = K.bind(this)),
      (this._onMouseDown = Y.bind(this)),
      (this._onMouseMove = I.bind(this)),
      (this._interceptControlDown = X.bind(this)),
      (this._interceptControlUp = F.bind(this)),
      this.domElement !== null && this.connect(this.domElement),
      this.update());
  }
  ["connect"](arg3) {
    (super.connect(arg3),
      this.domElement.addEventListener("pointerdown", this._onPointerDown),
      this.domElement.addEventListener("pointercancel", this._onPointerUp),
      this.domElement.addEventListener("contextmenu", this._onContextMenu),
      this.domElement.addEventListener("wheel", this._onMouseWheel, {
        passive: false,
      }),
      this.domElement.getRootNode().addEventListener("keydown", this._interceptControlDown, {
        passive: true,
        capture: true,
      }),
      (this.domElement.style.touchAction = "none"));
  }
  ["disconnect"]() {
    ((this._pendingTouch = null),
      this.domElement.removeEventListener("pointerdown", this._onPointerDown),
      this.domElement.ownerDocument.removeEventListener("pointermove", this._onPointerMove),
      this.domElement.ownerDocument.removeEventListener("pointerup", this._onPointerUp),
      this.domElement.removeEventListener("pointercancel", this._onPointerUp),
      this.domElement.removeEventListener("wheel", this._onMouseWheel),
      this.domElement.removeEventListener("contextmenu", this._onContextMenu),
      this.stopListenToKeyEvents(),
      this.domElement.getRootNode().removeEventListener("keydown", this._interceptControlDown, {
        capture: true,
      }),
      (this.domElement.style.touchAction = "auto"));
  }
  ["dispose"]() {
    this.disconnect();
  }
  ["getPolarAngle"]() {
    return this._spherical.phi;
  }
  ["getAzimuthalAngle"]() {
    return this._spherical.theta;
  }
  ["getDistance"]() {
    return this.object.position.distanceTo(this.target);
  }
  ["listenToKeyEvents"](arg4) {
    (arg4.addEventListener("keydown", this._onKeyDown), (this._domElementKeyEvents = arg4));
  }
  ["stopListenToKeyEvents"]() {
    this._domElementKeyEvents !== null &&
      (this._domElementKeyEvents.removeEventListener("keydown", this._onKeyDown),
      (this._domElementKeyEvents = null));
  }
  ["saveState"]() {
    (this.target0.copy(this.target),
      this.position0.copy(this.object.position),
      (this.zoom0 = this.object.zoom));
  }
  ["reset"]() {
    (this.target.copy(this.target0),
      this.object.position.copy(this.position0),
      (this.object.zoom = this.zoom0),
      this.object.updateProjectionMatrix(),
      this.dispatchEvent(S),
      this.update(),
      (this.state = o.NONE));
  }
  ["update"](arg5 = null) {
    const value1 = this.object.position;
    (h.copy(value1).sub(this.target),
      h.applyQuaternion(this._quat),
      this._spherical.setFromVector3(h),
      this.autoRotate &&
        this.state === o.NONE &&
        this._rotateLeft(this._getAutoRotationAngle(arg5)));
    let value2 = this._sphericalDelta.theta,
      value3 = this._sphericalDelta.phi;
    if (this.enableDamping) {
      if (this.rotateSmoothing > 0) {
        const value7 = arg5 === null ? 0.016666666666666666 : Math.max(0, arg5),
          value8 = MathUtils.clamp(this.rotateSmoothing * value7, 0, 1),
          value9 = Math.max(0, this.rotateSmoothingThreshold);
        ((value2 =
          Math.abs(this._sphericalDelta.theta) < value9
            ? this._sphericalDelta.theta
            : this._sphericalDelta.theta * value8),
          (value3 =
            Math.abs(this._sphericalDelta.phi) < value9
              ? this._sphericalDelta.phi
              : this._sphericalDelta.phi * value8));
      } else ((value2 *= this.dampingFactor), (value3 *= this.dampingFactor));
      ((this._spherical.theta += value2), (this._spherical.phi += value3));
    } else
      ((this._spherical.theta += this._sphericalDelta.theta),
        (this._spherical.phi += this._sphericalDelta.phi));
    let value4 = this.minAzimuthAngle,
      value5 = this.maxAzimuthAngle;
    (isFinite(value4) &&
      isFinite(value5) &&
      (value4 < -Math.PI ? (value4 += r) : value4 > Math.PI && (value4 -= r),
      value5 < -Math.PI ? (value5 += r) : value5 > Math.PI && (value5 -= r),
      value4 <= value5
        ? (this._spherical.theta = Math.max(value4, Math.min(value5, this._spherical.theta)))
        : (this._spherical.theta =
            this._spherical.theta > (value4 + value5) / 2
              ? Math.max(value4, this._spherical.theta)
              : Math.min(value5, this._spherical.theta))),
      (this._spherical.phi = Math.max(
        this.minPolarAngle,
        Math.min(this.maxPolarAngle, this._spherical.phi),
      )),
      this._spherical.makeSafe(),
      this.enableDamping === true
        ? this.target.addScaledVector(this._panOffset, this.dampingFactor)
        : this.target.add(this._panOffset),
      this.target.sub(this.cursor),
      this.target.clampLength(this.minTargetRadius, this.maxTargetRadius),
      this.target.add(this.cursor));
    let value6 = false;
    if ((this.zoomToCursor && this._performCursorZoom) || this.object.isOrthographicCamera)
      this._spherical.radius = this._clampDistance(this._spherical.radius);
    else {
      const value10 = this._spherical.radius;
      ((this._spherical.radius = this._clampDistance(this._spherical.radius * this._scale)),
        (value6 = value10 != this._spherical.radius));
    }
    if (
      (h.setFromSpherical(this._spherical),
      h.applyQuaternion(this._quatInverse),
      value1.copy(this.target).add(h),
      this.object.lookAt(this.target),
      this.enableDamping === true
        ? ((this._sphericalDelta.theta -= value2),
          (this._sphericalDelta.phi -= value3),
          this._panOffset.multiplyScalar(1 - this.dampingFactor))
        : (this._sphericalDelta.set(0, 0, 0), this._panOffset.set(0, 0, 0)),
      this.zoomToCursor && this._performCursorZoom)
    ) {
      let value11 = null;
      if (this.object.isPerspectiveCamera) {
        const value12 = h.length();
        value11 = this._clampDistance(value12 * this._scale);
        const value13 = value12 - value11;
        (this.object.position.addScaledVector(this._dollyDirection, value13),
          this.object.updateMatrixWorld(),
          (value6 = !!value13));
      } else {
        if (this.object.isOrthographicCamera) {
          const vector31 = new Vector3(this._mouse.x, this._mouse.y, 0);
          vector31.unproject(this.object);
          const value14 = this.object.zoom;
          ((this.object.zoom = Math.max(
            this.minZoom,
            Math.min(this.maxZoom, this.object.zoom / this._scale),
          )),
            this.object.updateProjectionMatrix(),
            (value6 = value14 !== this.object.zoom));
          const vector32 = new Vector3(this._mouse.x, this._mouse.y, 0);
          (vector32.unproject(this.object),
            this.object.position.sub(vector32).add(vector31),
            this.object.updateMatrixWorld(),
            (value11 = h.length()));
        } else
          (console.warn(
            "WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.",
          ),
            (this.zoomToCursor = false));
      }
      value11 !== null &&
        (this.screenSpacePanning
          ? this.target
              .set(0, 0, -1)
              .transformDirection(this.object.matrix)
              .multiplyScalar(value11)
              .add(this.object.position)
          : (b.origin.copy(this.object.position),
            b.direction.set(0, 0, -1).transformDirection(this.object.matrix),
            Math.abs(this.object.up.dot(b.direction)) < L
              ? this.object.lookAt(this.target)
              : (O.setFromNormalAndCoplanarPoint(this.object.up, this.target),
                b.intersectPlane(O, this.target))));
    } else {
      if (this.object.isOrthographicCamera) {
        const value15 = this.object.zoom;
        ((this.object.zoom = Math.max(
          this.minZoom,
          Math.min(this.maxZoom, this.object.zoom / this._scale),
        )),
          value15 !== this.object.zoom && (this.object.updateProjectionMatrix(), (value6 = true)));
      }
    }
    return (
      (this._scale = 1),
      (this._performCursorZoom = false),
      value6 ||
      this._lastPosition.distanceToSquared(this.object.position) > g ||
      8 * (1 - this._lastQuaternion.dot(this.object.quaternion)) > g ||
      this._lastTargetPosition.distanceToSquared(this.target) > g
        ? (this.dispatchEvent(S),
          this._lastPosition.copy(this.object.position),
          this._lastQuaternion.copy(this.object.quaternion),
          this._lastTargetPosition.copy(this.target),
          true)
        : false
    );
  }
  ["_getAutoRotationAngle"](arg6) {
    return arg6 !== null
      ? (r / 60) * this.autoRotateSpeed * arg6
      : (r / 60 / 60) * this.autoRotateSpeed;
  }
  ["_getZoomScale"](arg7) {
    const value16 = Math.abs(arg7 * 0.01);
    return Math.pow(0.95, this.zoomSpeed * value16);
  }
  ["_rotateLeft"](arg8) {
    this._sphericalDelta.theta -= arg8;
  }
  ["_rotateUp"](arg9) {
    this._sphericalDelta.phi -= arg9;
  }
  ["_panLeft"](arg10, arg11) {
    (h.setFromMatrixColumn(arg11, 0), h.multiplyScalar(-arg10), this._panOffset.add(h));
  }
  ["_panUp"](arg12, arg13) {
    (this.screenSpacePanning === true
      ? h.setFromMatrixColumn(arg13, 1)
      : (h.setFromMatrixColumn(arg13, 0), h.crossVectors(this.object.up, h)),
      h.multiplyScalar(arg12),
      this._panOffset.add(h));
  }
  ["_pan"](arg14, arg15) {
    const value17 = this.domElement;
    if (this.object.isPerspectiveCamera) {
      const value18 = this.object.position;
      h.copy(value18).sub(this.target);
      let value19 = h.length();
      ((value19 *= Math.tan(((this.object.fov / 2) * Math.PI) / 180)),
        this._panLeft((2 * arg14 * value19) / value17.clientHeight, this.object.matrix),
        this._panUp((2 * arg15 * value19) / value17.clientHeight, this.object.matrix));
    } else
      this.object.isOrthographicCamera
        ? (this._panLeft(
            (arg14 * (this.object.right - this.object.left)) /
              this.object.zoom /
              value17.clientWidth,
            this.object.matrix,
          ),
          this._panUp(
            (arg15 * (this.object.top - this.object.bottom)) /
              this.object.zoom /
              value17.clientHeight,
            this.object.matrix,
          ))
        : (console.warn(
            "WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.",
          ),
          (this.enablePan = false));
  }
  ["_dollyOut"](arg16) {
    this.object.isPerspectiveCamera || this.object.isOrthographicCamera
      ? (this._scale /= arg16)
      : (console.warn(
          "WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.",
        ),
        (this.enableZoom = false));
  }
  ["_dollyIn"](arg17) {
    this.object.isPerspectiveCamera || this.object.isOrthographicCamera
      ? (this._scale *= arg17)
      : (console.warn(
          "WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.",
        ),
        (this.enableZoom = false));
  }
  ["_updateZoomParameters"](arg18, arg19) {
    if (!this.zoomToCursor) return;
    this._performCursorZoom = true;
    const value20 = this.domElement.getBoundingClientRect(),
      value21 = arg18 - value20.left,
      value22 = arg19 - value20.top,
      value23 = value20.width,
      value24 = value20.height;
    ((this._mouse.x = (value21 / value23) * 2 - 1),
      (this._mouse.y = -(value22 / value24) * 2 + 1),
      this._dollyDirection
        .set(this._mouse.x, this._mouse.y, 1)
        .unproject(this.object)
        .sub(this.object.position)
        .normalize());
  }
  ["_clampDistance"](arg20) {
    return Math.max(this.minDistance, Math.min(this.maxDistance, arg20));
  }
  ["_handleMouseDownRotate"](arg21) {
    this._rotateStart.set(arg21.clientX, arg21.clientY);
  }
  ["_handleMouseDownDolly"](arg22) {
    (this._updateZoomParameters(arg22.clientX, arg22.clientX),
      this._dollyStart.set(arg22.clientX, arg22.clientY));
  }
  ["_handleMouseDownPan"](arg23) {
    this._panStart.set(arg23.clientX, arg23.clientY);
  }
  ["_handleMouseMoveRotate"](arg24) {
    (this._rotateEnd.set(arg24.clientX, arg24.clientY),
      this._rotateDelta
        .subVectors(this._rotateEnd, this._rotateStart)
        .multiplyScalar(this.rotateSpeed));
    const value25 = this.domElement;
    (this._rotateLeft((r * this._rotateDelta.x) / value25.clientHeight),
      this._rotateUp((r * this._rotateDelta.y) / value25.clientHeight),
      this._rotateStart.copy(this._rotateEnd),
      this.update());
  }
  ["_handleMouseMoveDolly"](arg25) {
    (this._dollyEnd.set(arg25.clientX, arg25.clientY),
      this._dollyDelta.subVectors(this._dollyEnd, this._dollyStart),
      this._dollyDelta.y > 0
        ? this._dollyOut(this._getZoomScale(this._dollyDelta.y))
        : this._dollyDelta.y < 0 && this._dollyIn(this._getZoomScale(this._dollyDelta.y)),
      this._dollyStart.copy(this._dollyEnd),
      this.update());
  }
  ["_handleMouseMovePan"](arg26) {
    (this._panEnd.set(arg26.clientX, arg26.clientY),
      this._panDelta.subVectors(this._panEnd, this._panStart).multiplyScalar(this.panSpeed),
      this._pan(this._panDelta.x, this._panDelta.y),
      this._panStart.copy(this._panEnd),
      this.update());
  }
  ["_handleMouseWheel"](arg27) {
    (this._updateZoomParameters(arg27.clientX, arg27.clientY),
      arg27.deltaY < 0
        ? this._dollyIn(this._getZoomScale(arg27.deltaY))
        : arg27.deltaY > 0 && this._dollyOut(this._getZoomScale(arg27.deltaY)),
      this.update());
  }
  ["_handleKeyDown"](arg28) {
    let value26 = false;
    switch (arg28.code) {
      case this.keys.UP:
        (arg28.ctrlKey || arg28.metaKey || arg28.shiftKey
          ? this.enableRotate &&
            this._rotateUp((r * this.keyRotateSpeed) / this.domElement.clientHeight)
          : this.enablePan && this._pan(0, this.keyPanSpeed),
          (value26 = true));
        break;
      case this.keys.BOTTOM:
        (arg28.ctrlKey || arg28.metaKey || arg28.shiftKey
          ? this.enableRotate &&
            this._rotateUp((-r * this.keyRotateSpeed) / this.domElement.clientHeight)
          : this.enablePan && this._pan(0, -this.keyPanSpeed),
          (value26 = true));
        break;
      case this.keys.LEFT:
        (arg28.ctrlKey || arg28.metaKey || arg28.shiftKey
          ? this.enableRotate &&
            this._rotateLeft((r * this.keyRotateSpeed) / this.domElement.clientHeight)
          : this.enablePan && this._pan(this.keyPanSpeed, 0),
          (value26 = true));
        break;
      case this.keys.RIGHT:
        (arg28.ctrlKey || arg28.metaKey || arg28.shiftKey
          ? this.enableRotate &&
            this._rotateLeft((-r * this.keyRotateSpeed) / this.domElement.clientHeight)
          : this.enablePan && this._pan(-this.keyPanSpeed, 0),
          (value26 = true));
        break;
    }
    value26 && (arg28.preventDefault(), this.update());
  }
  ["_handleTouchStartRotate"](arg29) {
    if (this._pointers.length === 1) this._rotateStart.set(arg29.pageX, arg29.pageY);
    else {
      const value27 = this._getSecondPointerPosition(arg29),
        value28 = 0.5 * (arg29.pageX + value27.x),
        value29 = 0.5 * (arg29.pageY + value27.y);
      this._rotateStart.set(value28, value29);
    }
  }
  ["_handleTouchStartPan"](arg30) {
    if (this._pointers.length === 1) this._panStart.set(arg30.pageX, arg30.pageY);
    else {
      const value30 = this._getSecondPointerPosition(arg30),
        value31 = 0.5 * (arg30.pageX + value30.x),
        value32 = 0.5 * (arg30.pageY + value30.y);
      this._panStart.set(value31, value32);
    }
  }
  ["_handleTouchStartDolly"](arg31) {
    const value33 = this._getSecondPointerPosition(arg31),
      value34 = arg31.pageX - value33.x,
      value35 = arg31.pageY - value33.y,
      value36 = Math.sqrt(value34 * value34 + value35 * value35);
    this._dollyStart.set(0, value36);
  }
  ["_handleTouchStartDollyPan"](arg32) {
    (this.enableZoom && this._handleTouchStartDolly(arg32),
      this.enablePan && this._handleTouchStartPan(arg32));
  }
  ["_handleTouchStartDollyRotate"](arg33) {
    (this.enableZoom && this._handleTouchStartDolly(arg33),
      this.enableRotate && this._handleTouchStartRotate(arg33));
  }
  ["_handleTouchMoveRotate"](arg34) {
    if (this._pointers.length == 1) this._rotateEnd.set(arg34.pageX, arg34.pageY);
    else {
      const value38 = this._getSecondPointerPosition(arg34),
        value39 = 0.5 * (arg34.pageX + value38.x),
        value40 = 0.5 * (arg34.pageY + value38.y);
      this._rotateEnd.set(value39, value40);
    }
    this._rotateDelta
      .subVectors(this._rotateEnd, this._rotateStart)
      .multiplyScalar(this.rotateSpeed);
    const value37 = this.domElement;
    (this._rotateLeft((r * this._rotateDelta.x) / value37.clientHeight),
      this._rotateUp((r * this._rotateDelta.y) / value37.clientHeight),
      this._rotateStart.copy(this._rotateEnd));
  }
  ["_handleTouchMovePan"](arg35) {
    if (this._pointers.length === 1) this._panEnd.set(arg35.pageX, arg35.pageY);
    else {
      const value41 = this._getSecondPointerPosition(arg35),
        value42 = 0.5 * (arg35.pageX + value41.x),
        value43 = 0.5 * (arg35.pageY + value41.y);
      this._panEnd.set(value42, value43);
    }
    (this._panDelta.subVectors(this._panEnd, this._panStart).multiplyScalar(this.panSpeed),
      this._pan(this._panDelta.x, this._panDelta.y),
      this._panStart.copy(this._panEnd));
  }
  ["_handleTouchMoveDolly"](arg36) {
    const value44 = this._getSecondPointerPosition(arg36),
      value45 = arg36.pageX - value44.x,
      value46 = arg36.pageY - value44.y,
      value47 = Math.sqrt(value45 * value45 + value46 * value46);
    (this._dollyEnd.set(0, value47),
      this._dollyDelta.set(0, Math.pow(this._dollyEnd.y / this._dollyStart.y, this.zoomSpeed)),
      this._dollyOut(this._dollyDelta.y),
      this._dollyStart.copy(this._dollyEnd));
    const value48 = (arg36.pageX + value44.x) * 0.5,
      value49 = (arg36.pageY + value44.y) * 0.5;
    this._updateZoomParameters(value48, value49);
  }
  ["_handleTouchMoveDollyPan"](arg37) {
    (this.enableZoom && this._handleTouchMoveDolly(arg37),
      this.enablePan && this._handleTouchMovePan(arg37));
  }
  ["_handleTouchMoveDollyRotate"](arg38) {
    (this.enableZoom && this._handleTouchMoveDolly(arg38),
      this.enableRotate && this._handleTouchMoveRotate(arg38));
  }
  ["_addPointer"](arg39) {
    this._pointers.push(arg39.pointerId);
  }
  ["_removePointer"](arg40) {
    delete this._pointerPositions[arg40.pointerId];
    for (let value50 = 0; value50 < this._pointers.length; value50++)
      if (this._pointers[value50] == arg40.pointerId) {
        this._pointers.splice(value50, 1);
        return;
      }
  }
  ["_isTrackingPointer"](arg41) {
    for (let value51 = 0; value51 < this._pointers.length; value51++)
      if (this._pointers[value51] == arg41.pointerId) return true;
    return false;
  }
  ["_trackPointer"](arg42) {
    let value52 = this._pointerPositions[arg42.pointerId];
    (value52 === undefined &&
      ((value52 = new Vector2()), (this._pointerPositions[arg42.pointerId] = value52)),
      value52.set(arg42.pageX, arg42.pageY));
  }
  ["_getSecondPointerPosition"](arg43) {
    const value53 = arg43.pointerId === this._pointers[0] ? this._pointers[1] : this._pointers[0];
    return this._pointerPositions[value53];
  }
  ["_customWheelEvent"](arg44) {
    const value54 = arg44.deltaMode,
      object1 = {
        clientX: arg44.clientX,
        clientY: arg44.clientY,
        deltaY: arg44.deltaY,
      };
    switch (value54) {
      case 1:
        object1.deltaY *= 16;
        break;
      case 2:
        object1.deltaY *= 100;
        break;
    }
    return (arg44.ctrlKey && !this._controlActive && (object1.deltaY *= 10), object1);
  }
}
function k(arg45) {
  if (
    this.enabled !== false &&
    (this._pointers.length === 0 &&
      (this.domElement.setPointerCapture(arg45.pointerId),
      this.domElement.ownerDocument.addEventListener("pointermove", this._onPointerMove),
      this.domElement.ownerDocument.addEventListener("pointerup", this._onPointerUp)),
    !this._isTrackingPointer(arg45))
  ) {
    if ((this._addPointer(arg45), arg45.pointerType === "touch")) {
      if (this._pointers.length === 1 && this.touchDragThreshold > 0) {
        (this._trackPointer(arg45),
          (this._pendingTouch = {
            pointerId: arg45.pointerId,
            x: arg45.clientX,
            y: arg45.clientY,
          }));
        return;
      }
      ((this._pendingTouch = null), this._onTouchStart(arg45));
    } else this._onMouseDown(arg45);
  }
}
function C(arg46) {
  if (this.enabled !== false && this._isTrackingPointer(arg46)) {
    if (this._pendingTouch) {
      const value55 = this._pendingTouch,
        value56 = arg46.clientX - value55.x,
        value57 = arg46.clientY - value55.y,
        value58 = Math.hypot(value56, value57);
      if (value58 < this.touchDragThreshold) return;
      this._pendingTouch = null;
      const value59 = 1 - this.touchDragThreshold / value58;
      (this._onTouchStart({
        pointerId: arg46.pointerId,
        pageX: arg46.pageX - value56 * value59,
        pageY: arg46.pageY - value57 * value59,
      }),
        this._onTouchMove(arg46));
      return;
    }
    arg46.pointerType === "touch" ? this._onTouchMove(arg46) : this._onMouseMove(arg46);
  }
}
function N(arg47) {
  if (!this._isTrackingPointer(arg47)) return;
  const value60 = this._pendingTouch !== null;
  switch (((this._pendingTouch = null), this._removePointer(arg47), this._pointers.length)) {
    case 0:
      (this.domElement.releasePointerCapture(arg47.pointerId),
        this.domElement.ownerDocument.removeEventListener("pointermove", this._onPointerMove),
        this.domElement.ownerDocument.removeEventListener("pointerup", this._onPointerUp),
        value60 || this.dispatchEvent(w),
        (this.state = o.NONE));
      break;
    case 1:
      const value61 = this._pointers[0],
        value62 = this._pointerPositions[value61];
      this._onTouchStart({
        pointerId: value61,
        pageX: value62.x,
        pageY: value62.y,
      });
      break;
  }
}
function Y(arg48) {
  let value63;
  switch (arg48.button) {
    case 0:
      value63 = this.mouseButtons.LEFT;
      break;
    case 1:
      value63 = this.mouseButtons.MIDDLE;
      break;
    case 2:
      value63 = this.mouseButtons.RIGHT;
      break;
    default:
      value63 = -1;
  }
  switch (value63) {
    case MOUSE.DOLLY:
      if (this.enableZoom === false) return;
      (this._handleMouseDownDolly(arg48), (this.state = o.DOLLY));
      break;
    case MOUSE.ROTATE:
      if (arg48.ctrlKey || arg48.metaKey || arg48.shiftKey) {
        if (this.enablePan === false) return;
        (this._handleMouseDownPan(arg48), (this.state = o.PAN));
      } else {
        if (this.enableRotate === false) return;
        (this._handleMouseDownRotate(arg48), (this.state = o.ROTATE));
      }
      break;
    case MOUSE.PAN:
      if (arg48.ctrlKey || arg48.metaKey || arg48.shiftKey) {
        if (this.enableRotate === false) return;
        (this._handleMouseDownRotate(arg48), (this.state = o.ROTATE));
      } else {
        if (this.enablePan === false) return;
        (this._handleMouseDownPan(arg48), (this.state = o.PAN));
      }
      break;
    default:
      this.state = o.NONE;
  }
  this.state !== o.NONE && this.dispatchEvent(P);
}
function I(arg49) {
  switch (this.state) {
    case o.ROTATE:
      if (this.enableRotate === false) return;
      this._handleMouseMoveRotate(arg49);
      break;
    case o.DOLLY:
      if (this.enableZoom === false) return;
      this._handleMouseMoveDolly(arg49);
      break;
    case o.PAN:
      if (this.enablePan === false) return;
      this._handleMouseMovePan(arg49);
      break;
  }
}
function U(arg50) {
  this.enabled === false ||
    this.enableZoom === false ||
    this.state !== o.NONE ||
    (arg50.preventDefault(),
    this.dispatchEvent(P),
    this._handleMouseWheel(this._customWheelEvent(arg50)),
    this.dispatchEvent(w));
}
function Z(arg51) {
  this.enabled !== false && this._handleKeyDown(arg51);
}
function z(arg52) {
  switch ((this._trackPointer(arg52), this._pointers.length)) {
    case 1:
      switch (this.touches.ONE) {
        case TOUCH.ROTATE:
          if (this.enableRotate === false) return;
          (this._handleTouchStartRotate(arg52), (this.state = o.TOUCH_ROTATE));
          break;
        case TOUCH.PAN:
          if (this.enablePan === false) return;
          (this._handleTouchStartPan(arg52), (this.state = o.TOUCH_PAN));
          break;
        default:
          this.state = o.NONE;
      }
      break;
    case 2:
      switch (this.touches.TWO) {
        case TOUCH.DOLLY_PAN:
          if (this.enableZoom === false && this.enablePan === false) return;
          (this._handleTouchStartDollyPan(arg52), (this.state = o.TOUCH_DOLLY_PAN));
          break;
        case TOUCH.DOLLY_ROTATE:
          if (this.enableZoom === false && this.enableRotate === false) return;
          (this._handleTouchStartDollyRotate(arg52), (this.state = o.TOUCH_DOLLY_ROTATE));
          break;
        default:
          this.state = o.NONE;
      }
      break;
    default:
      this.state = o.NONE;
  }
  this.state !== o.NONE && this.dispatchEvent(P);
}
function K(arg53) {
  switch ((this._trackPointer(arg53), this.state)) {
    case o.TOUCH_ROTATE:
      if (this.enableRotate === false) return;
      (this._handleTouchMoveRotate(arg53), this.update());
      break;
    case o.TOUCH_PAN:
      if (this.enablePan === false) return;
      (this._handleTouchMovePan(arg53), this.update());
      break;
    case o.TOUCH_DOLLY_PAN:
      if (this.enableZoom === false && this.enablePan === false) return;
      (this._handleTouchMoveDollyPan(arg53), this.update());
      break;
    case o.TOUCH_DOLLY_ROTATE:
      if (this.enableZoom === false && this.enableRotate === false) return;
      (this._handleTouchMoveDollyRotate(arg53), this.update());
      break;
    default:
      this.state = o.NONE;
  }
}
function H(arg54) {
  this.enabled !== false && arg54.preventDefault();
}
function X(arg55) {
  arg55.key === "Control" &&
    ((this._controlActive = true),
    this.domElement.getRootNode().addEventListener("keyup", this._interceptControlUp, {
      passive: true,
      capture: true,
    }));
}
function F(arg56) {
  arg56.key === "Control" &&
    ((this._controlActive = false),
    this.domElement.getRootNode().removeEventListener("keyup", this._interceptControlUp, {
      passive: true,
      capture: true,
    }));
}
export { x as OrbitControls };
