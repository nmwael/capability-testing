module.exports = {
  options: {
    doNotFollow: 'node_modules'
  },
  forbidden: [
    {
      name: 'no-cross-feature',
      comment: 'Prevent cross-feature imports',
      severity: 'error',
      from: { path: 'src/features/(billing|invoicing)' },
      to: { path: 'src/features/(billing|invoicing)' }
    }
  ]
};
