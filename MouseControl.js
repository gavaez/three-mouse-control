window.THREE || (THREE = {});

/**
 * @typedef {{
 *     last  : {pos: THREE.Vector3, angle: number=, axis: THREE.Vector3=},
 *     obj   : THREE.Object3D,
 *     pos   : THREE.Vector3,
 *     up    : THREE.Vector3,
 *     target: THREE.Vector3,
 * }} ObjectInfo
 */


/** @abstract */
THREE.MouseControl = class extends THREE.EventDispatcher {
    /**
     * @param {THREE.Object3D|Array.<THREE.Object3D>} objects
     * @param {HTMLElement=} opt_element
     */
    constructor(objects, opt_element) {
        super();

        this.speed                = 1;
        this.dynamicDampingFactor = .2;

        this._objInfo = (objects instanceof Array ? objects : [objects]).map(
            obj => Object.assign({
                last  : {pos: obj.position.clone()},
                obj   : obj,
                pos   : obj.position.clone(),
                up    : obj.up.clone(),
                target: new THREE.Vector3(),
            })
        );

        this._mouse = {
            capture: false,
            curr   : new THREE.Vector2(),
            prev   : new THREE.Vector2(),
        };

        this.button_ = THREE.MouseControl.ButtonEnum.left;
        this.dom_    = opt_element || document.body;
        this.rect_   = {left: 0, top: 0, width: 0, height: 0};

        this.dom_.addEventListener(
            THREE.MouseControl.EventEnum.mouseDown,
            e => this.mouseDown_(e)
        );
        document.addEventListener(
            THREE.MouseControl.EventEnum.mouseMove,
            e => this.mouseMove_(e)
        );
        document.addEventListener(
            THREE.MouseControl.EventEnum.mouseUp,
            e => this.mouseUp_(e)
        );

        addEventListener(
            THREE.MouseControl.EventEnum.resize,
            () => this.resize_()
        );
        this.resize_();
    }

    /** @return {THREE.MouseControl.ButtonEnum} */
    get button() {
        return this.button_;
    }

    /**
     * @param {THREE.MouseControl.ButtonEnum} btn
     * @return {THREE.MouseControl.ButtonEnum}
     */
    set button(btn) {
        if (btn === this.button_) {
            return btn;
        }

        btn === THREE.MouseControl.ButtonEnum.right
            ? this.dom.addEventListener(
                THREE.MouseControl.EventEnum.contextMenu,
                THREE.MouseControl.emptyHandler_,
            )
            : (this.button_ === THREE.MouseControl.ButtonEnum.right)
                && this.dom.removeEventListener(
                    THREE.MouseControl.EventEnum.contextMenu,
                    THREE.MouseControl.emptyHandler_,
                )
        ;

        return this.button_ = btn;
    }

    /** @return {HTMLElement} DOM element */
    get dom() {
        return this.dom_;
    }

    /**
     * @param {Event} e
     * @private
     */
    static emptyHandler_(e) {
        e.preventDefault();
    }

    /**
     * @param {ObjectInfo} info
     * @return {THREE.Vector3}
     * @protected
     */
    static _getEye(info) {
        return info.obj.position.clone().sub(info.target);
    }

    /**
     * @param {THREE.Object3D} obj
     * @return {?ObjectInfo}
     * @private
     */
    getObjectInfo_(obj) {
        for (let i in this._objInfo) {
            const info = this._objInfo[i];
            if (info.obj === obj) {
                return info;
            }
        }
    }

    /**
     * DOM element onMouseDown handler
     * @param {MouseEvent} e
     * @private
     */
    mouseDown_(e) {
        if (e.button !== this.button) {
            return;
        }

        this._mouse.capture = true;
        this._startMove(e.pageX, e.pageY);
        this._dispatchMove(THREE.MouseControl.EventEnum.moveStart);
    }

    /**
     * Document onMouseMove handler
     * @param {MouseEvent} e
     * @private
     */
    mouseMove_(e) {
        this._mouse.capture && this._doMove(e.pageX, e.pageY);
    }

    /**
     * Document onMouseUp handler
     * @param {MouseEvent} e
     * @private
     */
    mouseUp_(e) {
        if (!this._mouse.capture) {
            return;
        }

        this._mouse.capture = false;
        this._stopMove();
    }

    /**
     * Window onResize handler
     * @private
     */
    resize_() {
        const dom = this.dom;
        if (dom === document.body) {
            this.rect_.width  = innerWidth;
            this.rect_.height = innerHeight;
        } else {
            const r     = dom.getBoundingClientRect();
            const owner = dom.ownerDocument.documentElement;
            this.rect_  = {
                left  : r.left + pageXOffset - owner.clientLeft,
                top   : r.top + pageYOffset - owner.clientTop,
                width : r.width,
                height: r.height,
            };
        }
    }

    /**
     * @param {ObjectInfo} info
     * @protected
     */
    _checkChange(info) {
        if (info.last.pos.distanceToSquared(info.obj.position)
            <= THREE.MouseControl.EPS
        ) {
            return;
        }

        this.dispatchEvent({
            lookAt  : info.target.clone(),
            object  : info.obj,
            position: info.last.pos.clone(),
            type    : THREE.MouseControl.EventEnum.moveChange,
        });

        info.last.pos.copy(info.obj.position);
    }

    /**
     * @param {THREE.MouseControl.EventEnum} e event type
     * @protected
     */
    _dispatchMove(e) {
        this.dispatchEvent({
            type : e,
            mouse: {curr: this._mouse.curr, prev: this._mouse.prev},
        });
    }

    /**
     * Mouse move action
     * @param {number} x
     * @param {number} y
     * @protected
     */
    _doMove(x, y) {
        this._saveMove(x, y);
    }

    /**
     * Calc mouse offset vector
     * @param {number} x
     * @param {number} y
     * @return {THREE.Vector2}
     * @protected
     */
    _offsetCalc(x, y) {
        const r = this.getRect();

        return new THREE.Vector2(
            (x - r.left) / r.width,
            (y - r.top) / r.height,
        );
    }

    /**
     * Saving mouse position
     * @param {number=} opt_x
     * @param {number=} opt_y
     * @protected
     */
    _saveMove(opt_x, opt_y) {
        opt_x || opt_y
            ? this._mouse.curr = this._offsetCalc(opt_x || 0, opt_y || 0)
            : this._mouse.prev.copy(this._mouse.curr)
        ;
    }

    /**
     * @param {ObjectInfo} info
     * @param {THREE.Vector3} eye
     * @protected
     */
    _setEye(info, eye) {
        info.obj.position.addVectors(info.target, eye);
        info.obj.lookAt(info.target);

        this._checkChange(info)
    }

    /**
     * @param {number} x
     * @param {number} y
     * @protected
     */
    _startMove(x, y) {
        this._saveMove(x, y);
        this._saveMove();
    }

    /** @protected */
    _stopMove() {
        this._dispatchMove(THREE.MouseControl.EventEnum.moveStop);
    }

    /**
     * @return {{left: number, right: number, width: number, height: number}}
     */
    getRect() {
        return Object.assign({}, this.rect_);
    }

    /**
     * @param {THREE.Object3D} obj
     * @return {?THREE.Vector3}
     */
    getTarget(obj) {
        const info = this.getObjectInfo_(obj);
        if (info) {
            return info.target.clone();
        }
    }

    /** Restore origin objects positions */
    reset() {
        this._objInfo.forEach(info => {
            info.obj.position.copy(info.pos);
            info.obj.up.copy(info.up);

            this._checkChange(info);
            info.last.pos.copy(info.pos);
        });
    }

    /**
     * @param {THREE.Object3D} obj
     * @param {THREE.Vector3} target
     * @return {?THREE.Vector3}
     */
    setTarget(obj, target) {
        const info = this.getObjectInfo_(obj);
        if (info) {
            const origin = info.target;
            info.target  = target.clone();
            return origin;
        }
    }
};

/** @enum {number} */
THREE.MouseControl.ButtonEnum = {
    left  : 0,
    middle: 1,
    right : 2,
};

/** @const {number} */
THREE.MouseControl.EPS = .000001;

/** @enum {string} */
THREE.MouseControl.EventEnum = {
    contextMenu: 'contextmenu',
    mouseDown  : 'mousedown',
    mouseMove  : 'mousemove',
    mouseUp    : 'mouseup',
    mouseWheel : 'wheel',
    moveChange : 'movechange',
    moveStart  : 'movestart',
    moveStop   : 'movestop',
    resize     : 'resize',
    touchEnd   : 'touchend',
    touchMove  : 'touchmove',
    touchStart : 'touchstart',
};


/** @abstract */
THREE.TouchControl = class extends THREE.MouseControl {
    /** @override */
    constructor(objects, opt_element) {
        super(objects, opt_element);

        const dom = this.dom;
        dom.addEventListener(
            THREE.MouseControl.EventEnum.touchStart,
            e => this._touchStart(e)
        );
        dom.addEventListener(
            THREE.MouseControl.EventEnum.touchMove,
            e => this._touchMove(e)
        );
        dom.addEventListener(
            THREE.MouseControl.EventEnum.touchEnd,
            e => this._touchEnd(e)
        );
    }

    /**
     * Raises "Not Implemented" exception
     * @private
     */
    static notImplemented_() {
        throw new Error('Not implemented');
    }

    /**
     * DOM element onTouchEnd handler
     * @param {TouchEvent} e
     * @protected
     */
    _touchEnd(e) {
        THREE.TouchControl.notImplemented_();
    }

    /**
     * DOM element onTouchMove handler
     * @param {TouchEvent} e
     * @protected
     */
    _touchMove(e) {
        THREE.TouchControl.notImplemented_();
    }

    /**
     * DOM element onTouchStart handler
     * @param {TouchEvent} e
     * @protected
     */
    _touchStart(e) {
        this._dispatchMove(THREE.MouseControl.EventEnum.moveStart);
    }
};


THREE.RotationControl = class extends THREE.TouchControl {
    /** @override */
    constructor(objects, opt_element) {
        super(objects, opt_element);

        this._objInfo.forEach(info => {
            info.last.angle = 0;
            info.last.axis  = new THREE.Vector3();
        });
    }

    /**
     * @param {THREE.Vector3} direction
     * @param {ObjectInfo} info
     * @private
     */
    rotate_(direction, info) {
        const eye = THREE.MouseControl._getEye(info);
        let angle = direction.length();

        if (angle) {
            const up       = info.obj.up.clone().normalize();
            const sideways = (new THREE.Vector3())
                .crossVectors(up, eye.clone().normalize())
                .normalize()
                .setLength(direction.x)
            ;
            info.last.axis.crossVectors(
                up.setLength(direction.y).add(sideways),
                eye,
            ).normalize();
            info.last.angle = angle * this.speed;
        } else if (angle = this.dynamicDampingFactor && info.last.angle) {
            info.last.angle *= Math.sqrt(1 - this.dynamicDampingFactor);
        }

        if (!angle) {
            return;
        }

        const q = (new THREE.Quaternion()).setFromAxisAngle(
            info.last.axis,
            info.last.angle,
        );
        info.obj.up.applyQuaternion(q);
        this._setEye(info, eye.applyQuaternion(q))
    }

    /** @override */
    _doMove(x, y) {
        this._saveMove();
        super._doMove(x, y);

        const direction = new THREE.Vector3(
            this._mouse.curr.x - this._mouse.prev.x,
            this._mouse.curr.y - this._mouse.prev.y,
        );
        this._objInfo.forEach(info => this.rotate_(direction, info));
    }

    /** @override */
    _offsetCalc(x, y) {
        const r = this.getRect();
        const w = r.width >> 1;

        return new THREE.Vector2(
            (x - w - r.left) / w,
            (r.height + (r.top - y << 1)) / r.width,
        );
    }

    /** @protected */
    _stopMove() {
        this._saveMove();
        super._stopMove();
    }

    /** @override */
    _touchEnd(e) {
        if (e.touches.length !== 1) {
            return;
        }

        this._startMove(e.touches[0].pageX, e.touches[0].pageY);
        this._stopMove();
    }

    /** @override */
    _touchMove(e) {
        (e.touches.length === 1)
            && this._doMove(e.touches[0].pageX, e.touches[0].pageY)
        ;
    }

    /** @override */
    _touchStart(e) {
        if (e.touches.length !== 1) {
            return;
        }

        this._startMove(e.touches[0].pageX, e.touches[0].pageY);
        super._touchStart(e);
    }
};


THREE.PanControl = class extends THREE.MouseControl {
    /** @override */
    constructor(objects, opt_element) {
        super(objects, opt_element);

        this.button = THREE.MouseControl.ButtonEnum.right;
    }

    /**
     * @param {THREE.Vector2} change
     * @param {ObjectInfo} info
     * @private
     */
    pan_(change, info) {
        const eye = THREE.MouseControl._getEye(info);
        change    = change.clone().multiplyScalar(eye.length() * this.speed);

        info.target.add(
            eye
                .clone()
                .cross(info.obj.up)
                .setLength(change.x)
                .add(info.obj.up.clone().setLength(change.y))
        );

        this._setEye(info, eye);
    }

    /** @override */
    _doMove(x, y) {
        super._doMove(x, y);

        const change = this._mouse.curr.clone().sub(this._mouse.prev);
        if (change.lengthSq()) {
            this._objInfo.forEach(info => this.pan_(change, info));

            this.dynamicDampingFactor
                ? this._mouse.prev.add(
                    change.multiplyScalar(this.dynamicDampingFactor)
                )
                : this._saveMove()
            ;
        }
    }
};


THREE.ZoomControl = class extends THREE.TouchControl {
    /** @override */
    constructor(objects, opt_element) {
        super(objects, opt_element);

        this.minDistance = 0;
        this.maxDistance = Infinity;

        this.touchStart_ = this.touchEnd_ = 0;

        this.button = THREE.MouseControl.ButtonEnum.middle;

        this.dom.addEventListener(
            THREE.MouseControl.EventEnum.mouseWheel,
            e => this.mouseWheel_(e)
        );
    }

    /**
     * Calc touch distance
     * @param {TouchList} touches
     * @param {boolean=} opt_start
     * @private
     */
    distanceCalc_(touches, opt_start) {
        let x = [touches[0].pageX, touches[1].pageX];
        let y = [touches[0].pageY, touches[1].pageY];

        this[`_${opt_start ? 'start' : 'do'}Move`](
            x[0] + x[1] >> 1,
            y[0] + y[1] >> 1,
        );

        x = x[0] - x[1];
        y = y[0] - y[1];

        this.touchEnd_ = Math.sqrt(x * x + y * y);
        opt_start && (this.touchStart_ = this.touchEnd_);
    }

    /**
     * @param {boolean} capture
     * @private
     */
    doZoom_(capture) {
        let f = this.dynamicDampingFactor;
        this._objInfo.forEach(
            info => (this.zoom_(capture, info) === undefined) && (f = 0)
        );

        f
            ? this._mouse.prev.y +=
                f * (this._mouse.curr.y - this._mouse.prev.y)
            : this._saveMove()
        ;
    }

    /**
     * DOM element onMouseWheel handler
     * @param {WheelEvent} e
     * @private
     */
    mouseWheel_(e) {
        this._mouse.prev.y -=
            e.deltaY * ([.00025, .01, .025][e.deltaMode] || .00025)
        ;

        this._dispatchMove(THREE.MouseControl.EventEnum.moveStart);
        this.doZoom_(true/*capture*/);
        this._stopMove();
    }

    /**
     * @param {boolean} capture
     * @param {ObjectInfo} info
     * @return {?number}
     * @private
     */
    zoom_(capture, info) {
        let d;

        if (capture) {
            d = 1 + (this._mouse.curr.y - this._mouse.prev.y ) * this.speed;
            (d === 1 || d <= 0) && (d = 0);
        } else {
            d = this.touchStart_ / this.touchEnd_;
            this.touchStart_ = this.touchEnd_;
        }

        if (d) {
            const eye = THREE.MouseControl._getEye(info).multiplyScalar(d);

            if (this.maxDistance * this.maxDistance < eye.lengthSq()) {
                eye.setLength(this.maxDistance);
                d = undefined;
            }

            if (eye.lengthSq() < this.minDistance * this.minDistance) {
                eye.setLength(this.minDistance);
                d = undefined;
            }

            this._setEye(info, eye);
        }

        return d;
    }

    /** @override */
    _doMove(x, y) {
        super._doMove(x, y);
        this.doZoom_(this._mouse.capture);
    }

    /** @override */
    _touchEnd(e) {
        (1 < e.touches.length) && this._stopMove();
    }

    /** @override */
    _touchMove(e) {
        (1 < e.touches.length) && this.distanceCalc_(e.touches);
    }

    /** @override */
    _touchStart(e) {
        if (e.touches.length <= 1) {
            return;
        }

        this.distanceCalc_(e.touches, true/*start*/);
        super._touchStart(e);
    }
};
