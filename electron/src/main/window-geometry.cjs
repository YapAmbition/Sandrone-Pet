function canonicalBounds(position, area, size) {
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));
  const x = Number.isFinite(position?.x) ? position.x : area.x;
  const y = Number.isFinite(position?.y) ? position.y : area.y;
  return {
    x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height))),
    width,
    height
  };
}

function scaledSize(width, height, factor) {
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor))
  };
}

module.exports = { canonicalBounds, scaledSize };
