// Prusa cameras: a camera, with keys to switch between the cameras chosen
// (the printer's own, or any other camera entities). The picture is Home
// Assistant's own hui-image, the element its picture cards show a camera
// with: snapshots it refreshes itself (Auto), or the camera's live stream
// (Live). Crop: with Crop on, two taps on the picture choose the part shown,
// kept in this browser's memory until Crop is turned off or the page is
// reloaded (the camera is not changed).
import { css, html, nothing, unsafeCSS, type TemplateResult } from "lit";
import { ENABLED, TIME_FORMATS } from "../const";
import { entityName, findDeep, moreInfo, select, type Config, type HomeAssistant } from "../ha";
import { deviceOf, type Camera } from "../printer/device";
import { cardOf, displayField, displayOf, PrusaFeature, type FeatureForm } from "./base";
import type { Item } from "./keys";

const CAMERA_VIEWS: [string, string][] = [["auto", "Auto"], ["live", "Live"]];
// Each camera's crop (shares of the whole picture), and the cameras whose Crop is on
interface Crop { x: number; y: number; w: number; h: number }
const CROPS = new Map<string, Crop>();
const CROPPING = new Set<string>();
// Each camera's picture size, the last one known (see _pictureSize)
const SIZES = new Map<string, { width: number; height: number }>();
// A crop narrower than this share of the picture is a slip, not a crop
const MIN_CROP = 0.02;
// A tap moves the pointer less than this between press and release (px)
const TAP_SLOP = 10;
const WHOLE: Crop = { x: 0, y: 0, w: 1, h: 1 };
type Image = HTMLElement & {
  hass?: HomeAssistant; entity?: string; cameraImage?: string; cameraView?: string; aspectRatio?: string; fitMode?: string;
  updateComplete?: Promise<unknown>;
};
type Stamp = HTMLElement & { hass?: HomeAssistant; ts?: Date; format?: string };
interface Place { left: number; top: number }

export class PrusaCameras extends PrusaFeature {
  static override label = "Cameras";
  static override pickerName = "Prusa cameras";
  static override controls = ["camera_buttons", "camera_toggle", "crop"];
  static override defaults = ["camera_buttons", "crop"];

  // Any printer can show a camera: its own, or any other camera entity
  static override supports(): boolean {
    return true;
  }

  static override offered() {
    return [{ value: "camera_buttons", label: "Camera buttons" }, { value: "camera_toggle", label: "Camera toggle" }, { value: "crop", label: "Crop" }];
  }

  static override editor(hass: HomeAssistant, entityId?: string): FeatureForm {
    const device = deviceOf(hass, entityId);
    const offered = this.offered();
    const own = device.cameras.map((camera) => camera.entityId);
    return {
      pending: [],
      schema: [
        {
          name: "cameras", label: "Cameras",
          helper: "The printer's cameras from Prusa Connect, or any other camera entities, such as one that shows the printer better. The first shows when the card loads; the keys switch between them.",
          selector: { entity: { domain: "camera", multiple: true, reorder: true } },
        },
        {
          name: "camera_view", label: "Camera view",
          helper: "Auto: snapshots that Home Assistant refreshes. Live: the camera's stream.",
          selector: select(CAMERA_VIEWS),
        },
        {
          name: "controls", label: "Controls",
          helper: "Crop: tap two corners on the picture to show only that part, in this browser until the page is reloaded. Tap Crop again for the whole picture.",
          selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: offered } },
        },
        displayField(),
        {
          name: "show_last_updated", label: "Show the last updated time",
          helper: "In the Auto view, along the bottom of the picture, in the card's Time format (under Content).",
          selector: { boolean: {} },
        },
        {
          name: "full_width", label: "Full width",
          helper: "The features sit beside the title in two columns. On: the picture stretches across both. Off: it takes one column, and the next features sit beside it.",
          selector: { boolean: {} },
        },
      ],
      data: (c: Config) => ({
        cameras: Array.isArray(c.cameras) && c.cameras.length ? c.cameras : own, camera_view: c.camera_view === "live" ? "live" : "auto",
        controls: Array.isArray(c.controls) ? c.controls : this.defaults.filter((id) => offered.some((o) => o.value === id)),
        show: displayOf(c), show_last_updated: c.show_last_updated !== false, full_width: c.full_width !== false,
      }),
    };
  }

  static override styles = [PrusaFeature.styles, css`
    .shot {
      position: relative; display: block; width: 100%; padding: 0; border: 0; cursor: pointer;
      border-radius: var(--feature-border-radius, 12px); overflow: hidden; background: #111;
      touch-action: manipulation; user-select: none; -webkit-user-select: none;
    }
    .shot:has(~ .rows .row) { margin-bottom: var(--ha-card-feature-gap, 12px); }
    .shot.cropping { cursor: crosshair; }
    .view { position: relative; overflow: hidden; }
    .view hui-image { display: block; }
    .view.cropped hui-image { position: absolute; }
    .area {
      position: absolute; pointer-events: none; box-sizing: border-box;
      border: 2px solid ${unsafeCSS(ENABLED)}; box-shadow: 0 0 0 1px rgba(0, 0, 0, .6), 0 0 0 100vmax rgba(0, 0, 0, .35);
    }
    .area[hidden] { display: none; }
    .hint, .time {
      position: absolute; left: 0; right: 0; text-align: start; pointer-events: none;
      font-size: var(--ha-font-size-s, 12px); color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .9);
    }
    .hint { top: 0; padding: 6px 12px 16px; background: linear-gradient(to bottom, rgba(0, 0, 0, .6), rgba(0, 0, 0, 0)); }
    .time { bottom: 0; padding: 16px 12px 6px; background: linear-gradient(to top, rgba(0, 0, 0, .6), rgba(0, 0, 0, 0)); }
    .hint:empty, .time:empty { display: none; }
  `];

  private _camera?: string;
  private _picked?: string;
  private _image?: Image;
  private _stamp?: Stamp;
  private _pictureAt?: Date;
  private _first?: { x: number; y: number; at: Place };
  private _area?: Place & { width: number; height: number };
  private _down?: { x: number; y: number };
  private _tapped = false;
  private _loading = false;
  private _watchedRoot?: ShadowRoot;
  private _sizer = new ResizeObserver(() => this._applyCrop());

  private get _cameraView(): string {
    return this._config?.camera_view === "live" ? "live" : "auto";
  }

  /** The cameras shown, in order: those chosen (cameras), or else the printer's own. */
  private _cameras(): Camera[] {
    const chosen: unknown[] = Array.isArray(this._config?.cameras) ? this._config!.cameras : [];
    const ids = chosen.filter((id): id is string => typeof id === "string" && id.startsWith("camera."));
    return ids.length ? ids.map((entityId) => ({ entityId, id: entityId })) : this._device.cameras;
  }

  protected override _watched(): string[] {
    return this._config ? this._cameras().map((camera) => camera.entityId) : [];
  }

  /**
   * Home Assistant's image stops fetching photos when the connection to
   * Home Assistant drops, and does not start again after it returns while it
   * stays on screen; a camera that was unavailable can leave it on a broken
   * picture. Either way, the image is made anew.
   */
  override set hass(hass: HomeAssistant) {
    const before = this._hass;
    if (before && this._image) {
      const camera = this._image.cameraImage ?? "";
      const back = before.connected === false && hass.connected !== false;
      const returned = before.states[camera]?.state === "unavailable" && hass.states[camera] && hass.states[camera].state !== "unavailable";
      if (back || returned) this._image = undefined;
    }
    super.hass = hass;
  }

  override get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  /** Whether the picture is waiting for the crop's corners: Crop is on, with no crop chosen yet. */
  private get _choosing(): boolean {
    return !!this._camera && CROPPING.has(this._camera) && !CROPS.has(this._camera);
  }

  /** The crop shown now: the camera's while Crop is on, else the whole picture. */
  private _shownCrop(): Crop {
    return (this._camera && CROPPING.has(this._camera) && CROPS.get(this._camera)) || WHOLE;
  }

  protected override _lines(): Item[][] {
    const moment = this._moment();
    const cameras = this._cameras();
    const current = this._camera;
    const nameOf = (c: Camera) => entityName(moment.hass, c.entityId) ?? c.id;
    const shortOf = (c: Camera) => nameOf(c).replace(/^Camera\s+/i, "");
    const keys: Record<string, () => Item[]> = {
      camera_buttons: () => (cameras.length < 2 ? [] : cameras.map((c) => ({
        key: c.entityId, entity: c.entityId, label: nameOf(c), text: shortOf(c),
        pressed: c.entityId === current, disabled: !this._usable(c.entityId), action: () => this._pick(c.entityId),
      }))),
      camera_toggle: () => {
        if (cameras.length < 2) return [];
        const at = cameras.findIndex((c) => c.entityId === current);
        const next = [...cameras.slice(at + 1), ...cameras.slice(0, at)].find((c) => this._usable(c.entityId));
        const shown = cameras[Math.max(0, at)];
        return [{
          key: "camera_toggle", entity: shown.entityId, text: shortOf(shown),
          label: next ? `${nameOf(shown)}. Tap for ${nameOf(next)}` : nameOf(shown), pressed: false, disabled: !next,
          action: () => next && this._pick(next.entityId),
        }];
      },
      crop: () => {
        if (!current) return [];
        const on = CROPPING.has(current);
        return [{
          key: "crop", icon: "mdi:crop", text: "Crop", pressed: on, disabled: !this._usable(current),
          label: on ? "Crop: on. Tap two corners on the picture; tap Crop again for the whole picture" : "Crop",
          action: () => this._toggleCropping(),
        }];
      },
    };
    return [this._chosen().flatMap((id) => keys[id]?.() ?? [])];
  }

  protected override render(): TemplateResult {
    const cameras = this._cameras();
    const ids = cameras.map((c) => c.entityId);
    const current = this._picked && ids.includes(this._picked) ? this._picked : ids[0];
    if (current !== this._camera) {
      this._camera = current;
      this._pictureAt = undefined;
      this._first = undefined;
      this._area = undefined;
    }
    const rows = super.render();
    this._showNothing(cameras.length === 0);
    const image = this._showCamera();
    const choosing = this._choosing;
    const hint = !choosing ? "" : this._first ? "Tap the opposite corner of the crop area" : "Tap a corner to start selection of a crop area";
    const area = this._area;
    const label = this._camera ? `${entityName(this._hass, this._camera) ?? "Camera"}: ${CROPPING.has(this._camera) ? "crop" : "open"}` : "";
    return html`<button type="button" class="shot ${choosing ? "cropping" : ""}" aria-label=${label}
      @pointerdown=${this._pointerDown} @pointerup=${this._pointerUp} @click=${this._click} @pointermove=${this._pointerMove}
      ><div class="view">${image ?? nothing}</div><span class="area" ?hidden=${!area}
        style=${area ? `left:${area.left}px;top:${area.top}px;width:${area.width}px;height:${area.height}px` : ""}></span
      ><span class="hint">${hint}</span><span class="time">${this._time()}</span></button>${rows}`;
  }

  protected override firstUpdated(): void {
    this._sizer.observe(this.renderRoot.querySelector(".shot")!);
  }

  protected override updated(): void {
    super.updated();
    this._watchPictures();
    this._applyCrop();
  }

  private _pick(entityId: string): void {
    this._picked = entityId;
    this.requestUpdate();
  }

  // A tap is a pointer pressed and let go in about one place; the click that follows on touch is the same tap
  private _pointerDown = (ev: PointerEvent) => {
    this._down = ev.button === 0 ? { x: ev.clientX, y: ev.clientY } : undefined;
    this._tapped = false;
  };

  private _pointerUp = (ev: PointerEvent) => {
    const down = this._down;
    this._down = undefined;
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > TAP_SLOP) return;
    this._tapped = true;
    this._tap(ev);
  };

  private _click = (ev: MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
    if (this._tapped) this._tapped = false;
    else this._tap(ev);
  };

  // After the first corner, the rectangle follows the pointer
  private _pointerMove = (ev: PointerEvent) => {
    if (this._first) this._showArea(this._first.at, this._placeOf(ev));
  };

  /** A tap on the picture: while a crop is being chosen it marks a corner; otherwise it opens the camera. */
  private _tap(ev: MouseEvent): void {
    if (!this._camera) return;
    if (this._choosing) this._cropTap(ev);
    else moreInfo(this, this._camera);
  }

  /**
   * Crop on: two taps on the picture choose the part shown, which stays
   * until Crop is turned off. Off: the whole picture, and the crop is forgotten.
   */
  private _toggleCropping(): void {
    const camera = this._camera!;
    if (CROPPING.has(camera)) {
      CROPPING.delete(camera);
      CROPS.delete(camera);
    } else {
      CROPPING.add(camera);
    }
    this._first = undefined;
    this._area = undefined;
    this.requestUpdate();
  }

  private get _shot(): HTMLElement | null {
    return this.renderRoot.querySelector(".shot");
  }

  private get _view(): HTMLElement | null {
    return this.renderRoot.querySelector(".view");
  }

  /** A place in the picture box (px). */
  private _placeOf(ev: MouseEvent): Place {
    const shot = this._shot!;
    const box = shot.getBoundingClientRect();
    const scale = box.width / shot.offsetWidth || 1;
    return { left: (ev.clientX - box.left) / scale, top: (ev.clientY - box.top) / scale };
  }

  private _showArea(a: Place, b: Place): void {
    this._area = { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), width: Math.abs(b.left - a.left), height: Math.abs(b.top - a.top) };
    this.requestUpdate();
  }

  // First tap: a corner; second tap: the opposite corner, which sets the crop
  private _cropTap(ev: MouseEvent): void {
    const box = this._view?.getBoundingClientRect();
    if (!box?.width || !box.height) return;
    const shown = this._shownCrop();
    const u = (ev.clientX - box.left) / box.width, v = (ev.clientY - box.top) / box.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const point = { x: shown.x + u * shown.w, y: shown.y + v * shown.h, at: this._placeOf(ev) };
    if (!this._first) {
      this._first = point;
      this._showArea(point.at, point.at);
      return;
    }
    const first = this._first;
    this._first = undefined;
    this._area = undefined;
    const crop = { x: Math.min(first.x, point.x), y: Math.min(first.y, point.y), w: Math.abs(point.x - first.x), h: Math.abs(point.y - first.y) };
    if (crop.w >= MIN_CROP && crop.h >= MIN_CROP) CROPS.set(this._camera!, crop);
    this.requestUpdate();
  }

  /**
   * The picture's own size (an image's, or a live stream's). While a new
   * picture loads it has none yet, so the last size the camera had is kept:
   * the crop and its shape stay steady between pictures.
   */
  private _pictureSize(): { width: number; height: number } | undefined {
    const el = this._image?.shadowRoot && findDeep(this._image.shadowRoot, "img, video", 3) as (HTMLImageElement & HTMLVideoElement) | null;
    const width = el ? el.naturalWidth || el.videoWidth : 0, height = el ? el.naturalHeight || el.videoHeight : 0;
    if (width && height) SIZES.set(this._camera!, { width, height });
    return this._camera ? SIZES.get(this._camera) : undefined;
  }

  /**
   * Show the crop: the box takes the crop's shape (the whole picture's
   * without one), and the picture is scaled and moved so only the crop
   * shows. Home Assistant's image is given the picture's last known shape
   * (its aspect_ratio, as a picture card's), so it keeps that shape while it
   * loads the next picture: the box neither collapses nor stretches.
   */
  private _applyCrop(): void {
    const view = this._view, image = this._image;
    if (!view || !image) return;
    const crop = this._shownCrop(), size = this._pictureSize();
    view.classList.toggle("cropped", !!size);
    if (!size) {
      view.style.aspectRatio = "";
      Object.assign(image.style, { width: "", left: "", top: "" });
      return;
    }
    const shape = `${size.width}x${size.height}`;
    if (image.aspectRatio !== shape) image.aspectRatio = shape;
    view.style.aspectRatio = `${size.width * crop.w} / ${size.height * crop.h}`;
    Object.assign(image.style, { width: `${100 / crop.w}%`, left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%` });
  }

  /** Home Assistant's image of the camera shown, made once for each camera, as its picture cards have it. */
  private _showCamera(): Image | undefined {
    const camera = this._camera;
    if (!this._hass || !camera) return undefined;
    if (!customElements.get("hui-image")) {
      // Loaded with Home Assistant's picture cards: ask the card helpers for one
      if (!this._loading) {
        this._loading = true;
        window.loadCardHelpers?.()
          .then((helpers) => helpers.createCardElement({ type: "picture-entity", entity: camera, camera_image: camera }))
          .then(() => customElements.whenDefined("hui-image"))
          .then(() => {
            this._loading = false;
            this.requestUpdate();
          });
      }
      return undefined;
    }
    if (this._image?.cameraImage !== camera) {
      this._image = document.createElement("hui-image") as Image;
      Object.assign(this._image, { entity: camera, cameraImage: camera, fitMode: "fill" });
      this._watchedRoot = undefined;
    }
    if (this._image.hass !== this._hass) this._image.hass = this._hass;
    if (this._image.cameraView !== this._cameraView) this._image.cameraView = this._cameraView;
    return this._image;
  }

  // The time shown is when the latest picture arrived in Home Assistant's image
  private _watchPictures(): void {
    const image = this._image;
    const root = image?.shadowRoot;
    if (!image || !root) {
      Promise.resolve(image?.updateComplete).then(() => image?.shadowRoot && image === this._image && this._watchPictures());
      return;
    }
    if (this._watchedRoot === root) return;
    this._watchedRoot = root;
    root.addEventListener("load", () => {
      this._pictureAt = new Date();
      this._applyCrop();
      this.requestUpdate();
    }, true);
    root.addEventListener("loadedmetadata", () => this._applyCrop(), true);
  }

  /** The last updated time along the bottom of the picture (Auto view), in the tile card's time format. */
  private _time(): TemplateResult | typeof nothing {
    const shown = this._config?.show_last_updated !== false && this._cameraView === "auto" && this._pictureAt;
    if (!shown) return nothing;
    const card = cardOf(this);
    const chosen = card?.config?.time_format;
    this._stamp ??= document.createElement("hui-timestamp-display") as Stamp;
    this._stamp.hass = this._hass;
    this._stamp.ts = this._pictureAt;
    this._stamp.format = TIME_FORMATS.includes(chosen) ? chosen : undefined;
    return html`Updated ${this._stamp}`;
  }
}
