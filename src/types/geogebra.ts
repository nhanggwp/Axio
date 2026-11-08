export type Listener = (name: string) => void;
export interface GGBApi {
  evalCommand(command: string): boolean;
  asyncEvalCommand(command: string): Promise<string>;
  evalCommandGetLabels(command: string): string;
  getAllObjectNames(type?: string): string[];
  getObjectType(name: string): string;
  getValueString(name: string, localized?: boolean): string;
  getCommandString(name: string, localized?: boolean): string;
  getValue(name: string): number;
  getXcoord(name: string): number;
  getYcoord(name: string): number;
  getColor(name: string): string;
  getVisible(name: string): boolean;
  isIndependent(name: string): boolean;
  isMoveable(name: string): boolean;
  isDefined(name: string): boolean;
  exists(name: string): boolean;
  setCoords(name: string, x: number, y: number): void;
  setColor(name: string, r: number, g: number, b: number): void;
  setVisible(name: string, visible: boolean): void;
  setLabelVisible(name: string, visible: boolean): void;
  setLabelStyle(name: string, style: number): void;
  setLineThickness(name: string, width: number): void;
  setLineStyle(name: string, style: number): void;
  setPointSize(name: string, size: number): void;
  setFilling(name: string, amount: number): void;
  setFixed(name: string, fixed: boolean, selectionAllowed?: boolean): void;
  renameObject(oldName: string, newName: string): boolean;
  deleteObject(name: string): void;
  setPerspective(perspective: string): void;
  setMode(mode: number): void;
  setSize(width: number, height: number): void;
  setCoordSystem(xmin: number, xmax: number, ymin: number, ymax: number): void;
  setAxesVisible(x: boolean, y: boolean): void;
  setGridVisible(visible: boolean): void;
  getMode(): number;
  getViewProperties(view: number): string;
  setPointCapture(view: number, mode: number): void;
  setGraphicsOptions(view: number, options: Record<string, unknown>): void;
  getXML(name?: string): string;
  getLineThickness(name: string): number;
  getLineStyle(name: string): number;
  showAllObjects(): void;
  getGraphicsOptions(view: number): Record<string, unknown> | string;
  registerRenameListener(cb: (oldName: string, newName: string) => void): void;
  unregisterRenameListener(
    cb: (oldName: string, newName: string) => void,
  ): void;
  setXML(xml: string): void;
  getBase64(callback: (data: string) => void): void;
  setBase64(data: string, callback?: () => void): void;
  getPNGBase64(scale: number, transparent: boolean, dpi?: number): string;
  exportSVG(callback: (svg: string | null) => void): void;
  setErrorDialogsActive(active: boolean): void;
  setRounding(rounding: string): void;
  newConstruction(): void;
  remove(): void;
  registerAddListener(cb: Listener): void;
  unregisterAddListener(cb: Listener): void;
  registerRemoveListener(cb: Listener): void;
  unregisterRemoveListener(cb: Listener): void;
  registerUpdateListener(cb: Listener): void;
  unregisterUpdateListener(cb: Listener): void;
  registerClickListener(cb: Listener): void;
  unregisterClickListener(cb: Listener): void;
  registerClearListener(cb: () => void): void;
  unregisterClearListener(cb: () => void): void;
  registerClientListener(cb: (event: unknown) => void): void;
  unregisterClientListener(cb: (event: unknown) => void): void;
}
declare global {
  interface Window {
    GGBApplet: new (
      params: Record<string, unknown>,
      html5: boolean,
    ) => { inject: (id: string) => void };
    axio?: import("../geometry/GeometryController").GeometryController;
  }
}
