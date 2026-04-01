window.SplitTree = {
  createLeaf(paneId) {
    return { type: 'leaf', paneId };
  },

  splitNode(tree, targetPaneId, direction, newPaneId) {
    if (tree.type === 'leaf') {
      if (tree.paneId === targetPaneId) {
        return {
          type: 'split',
          direction,
          ratio: 0.5,
          children: [
            { type: 'leaf', paneId: targetPaneId },
            { type: 'leaf', paneId: newPaneId },
          ],
        };
      }
      return tree;
    }
    return {
      ...tree,
      children: [
        this.splitNode(tree.children[0], targetPaneId, direction, newPaneId),
        this.splitNode(tree.children[1], targetPaneId, direction, newPaneId),
      ],
    };
  },

  removeNode(tree, targetPaneId) {
    if (tree.type === 'leaf') {
      return tree.paneId === targetPaneId ? null : tree;
    }
    if (tree.children[0].type === 'leaf' && tree.children[0].paneId === targetPaneId) {
      return tree.children[1];
    }
    if (tree.children[1].type === 'leaf' && tree.children[1].paneId === targetPaneId) {
      return tree.children[0];
    }
    const newChildren = [
      this.removeNode(tree.children[0], targetPaneId),
      this.removeNode(tree.children[1], targetPaneId),
    ];
    if (!newChildren[0]) return newChildren[1];
    if (!newChildren[1]) return newChildren[0];
    return { ...tree, children: newChildren };
  },

  findLeaves(tree) {
    if (tree.type === 'leaf') return [tree.paneId];
    return [
      ...this.findLeaves(tree.children[0]),
      ...this.findLeaves(tree.children[1]),
    ];
  },
};
