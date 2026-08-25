class MovementAreaTracker {
  constructor(platform = process.platform) {
    this.platform = platform;
    this.horizontalAreas = new Map();
  }

  areaFor(display) {
    const current = { ...display.workArea };
    if (this.platform !== 'darwin') return current;

    const key = String(display.id);
    const previous = this.horizontalAreas.get(key);
    if (!previous || current.width > previous.width) {
      this.horizontalAreas.set(key, { x: current.x, width: current.width });
    }

    const horizontal = this.horizontalAreas.get(key);
    return {
      x: horizontal.x,
      y: current.y,
      width: horizontal.width,
      height: current.height
    };
  }

  remove(displayId) {
    this.horizontalAreas.delete(String(displayId));
  }

  clear() {
    this.horizontalAreas.clear();
  }
}

module.exports = { MovementAreaTracker };
