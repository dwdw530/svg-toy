export function createEmptyDocument() {
  return {
    version: 1,
    viewBox: { x: 0, y: 0, w: 800, h: 600 },
    settings: {
      placementSize: 128,
      snapToGrid: false,
      gridSize: 8
    },
    assets: {},
    nodes: [],
    selection: { nodeIds: [] }
  };
}

