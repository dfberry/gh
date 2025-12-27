const rules = [
  {
    category: 'cli',
    confidence: 0.85,
    topicsContains: ['cli'],
    readmeContains: ['\bcli\b'],
    languagesContains: ['go', 'shell'],
  },
  {
    category: 'library',
    confidence: 0.8,
    topicsContains: ['library'],
    readmeContains: ['library', 'module'],
    nameContains: ['lib'],
  },
  {
    category: 'infra',
    confidence: 0.9,
    readmeContains: ['terraform', 'docker'],
    topicsContains: ['infrastructure'],
    languagesContains: ['hcl'],
  },
  {
    category: 'docs',
    confidence: 0.7,
    topicsContains: ['docs'],
    readmeContains: ['documentation', 'docs', 'readme'],
    sizeEquals: 0,
  },
  {
    category: 'sample',
    confidence: 0.85,
    readmeContains: ['example', 'sample'],
    nameContains: ['example'],
  },
  {
    category: 'web',
    confidence: 0.75,
    languagesContains: ['html'],
    readmeContains: ['website', 'site'],
  },
];

export default rules;
