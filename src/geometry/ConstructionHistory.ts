import { constructionKey } from "./GeometryState";
export type HistorySnapshot = { states: string[]; index: number };
export class ConstructionHistory {
  private states: string[] = [];
  private index = -1;
  reset(xml: string) {
    this.states = [xml];
    this.index = 0;
  }
  capture(): HistorySnapshot { return { states: [...this.states], index: this.index }; }
  restore(snapshot: HistorySnapshot) { this.states = [...snapshot.states]; this.index = snapshot.index; }
  replaceCurrent(xml: string) { if (this.index >= 0 && this.index < this.states.length) this.states[this.index] = xml; }
  push(xml: string) {
    if (constructionKey(this.states[this.index] ?? "") === constructionKey(xml))
      return;
    this.states = this.states.slice(0, this.index + 1);
    this.states.push(xml);
    if (this.states.length > 80) this.states.shift();
    this.index = this.states.length - 1;
  }
  get canUndo() {
    return this.index > 0;
  }
  get canRedo() {
    return this.index < this.states.length - 1;
  }
  peek(direction: "undo" | "redo") {
    return direction === "undo"
      ? (this.canUndo ? this.states[this.index - 1] : undefined)
      : (this.canRedo ? this.states[this.index + 1] : undefined);
  }
  undo() {
    return this.canUndo ? this.states[--this.index] : undefined;
  }
  redo() {
    return this.canRedo ? this.states[++this.index] : undefined;
  }
}
