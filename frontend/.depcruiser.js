export default {
  options: {
    doNotFollow: 'node_modules'
  },
  forbidden: [
    {
      name: 'no-cross-feature',
      comment: 'Prevent cross-feature imports',
      severity: 'error',
      from: { path: 'src/features/(alerting|publication)' },
      to: { path: 'src/features/(alerting|publication)' }
    }
  ]
};
