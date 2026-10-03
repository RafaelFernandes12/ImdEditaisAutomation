// Termos em minúsculas, já normalizados (labels do GitHub e variações comuns).
export const ECOSYSTEMS = {
  java: {
    label: 'Java',
    terms: [
      'java',
      'spring',
      'spring boot',
      'kotlin',
      'quarkus',
      'micronaut',
      'hibernate',
      'jpa',
      'maven',
      'gradle',
      'jakarta ee',
    ],
  },
  javascript: {
    label: 'JavaScript / TypeScript',
    terms: [
      'javascript',
      'typescript',
      'node.js',
      'react',
      'angular',
      'vue',
      'next.js',
      'nestjs',
      'express',
      'svelte',
    ],
  },
  node: {
    label: 'Node.js (back-end)',
    terms: [
      'node.js',
      'nestjs',
      'express',
      'fastify',
      'adonisjs',
      'prisma',
      'typeorm',
      'bun',
      'deno',
    ],
  },
  react: {
    label: 'React',
    terms: ['react', 'next.js', 'redux', 'react query', 'remix', 'vite'],
  },
  angular: {
    label: 'Angular',
    terms: ['angular', 'angularjs', 'rxjs', 'ngrx'],
  },
  vue: {
    label: 'Vue',
    terms: ['vue', 'nuxt', 'pinia', 'vuex', 'quasar'],
  },
  python: {
    label: 'Python',
    terms: ['python', 'django', 'flask', 'fastapi', 'celery', 'sqlalchemy'],
  },
  dotnet: {
    label: '.NET / C#',
    terms: [
      '.net',
      'c#',
      'asp.net',
      'asp',
      'entity framework',
      'blazor',
      'xamarin',
    ],
  },
  php: {
    label: 'PHP',
    terms: ['php', 'laravel', 'symfony', 'codeigniter', 'wordpress'],
  },
  ruby: {
    label: 'Ruby',
    terms: ['ruby', 'rails', 'ruby on rails', 'sidekiq'],
  },
  go: {
    label: 'Go',
    terms: ['go', 'golang', 'gin', 'echo', 'fiber'],
  },
  rust: {
    label: 'Rust',
    terms: ['rust', 'tokio', 'actix', 'axum'],
  },
  cpp: {
    label: 'C / C++ / Embarcados',
    terms: ['c', 'c++', 'embarcados', 'embedded', 'firmware', 'rtos', 'qt'],
  },
  android: {
    label: 'Android',
    terms: ['android', 'kotlin', 'jetpack compose', 'java'],
  },
  ios: {
    label: 'iOS',
    terms: ['ios', 'swift', 'swiftui', 'objective-c'],
  },
  mobile: {
    label: 'Mobile multiplataforma',
    terms: ['flutter', 'dart', 'react native', 'expo', 'ionic'],
  },
  dados: {
    label: 'Dados / Banco de dados',
    terms: [
      'sql',
      'postgresql',
      'mysql',
      'sql server',
      'oracle',
      'mongodb',
      'redis',
      'power bi',
      'etl',
      'spark',
      'airflow',
      'dbt',
    ],
  },
  ia: {
    label: 'IA / Machine Learning',
    terms: [
      'machine learning',
      'ia',
      'llm',
      'pytorch',
      'tensorflow',
      'scikit-learn',
      'pandas',
      'langchain',
      'nlp',
      'visão computacional',
    ],
  },
  devops: {
    label: 'DevOps / Cloud',
    terms: [
      'docker',
      'kubernetes',
      'aws',
      'azure',
      'gcp',
      'terraform',
      'ci/cd',
      'jenkins',
      'linux',
      'ansible',
    ],
  },
  qa: {
    label: 'QA / Testes',
    terms: [
      'qa',
      'testes automatizados',
      'cypress',
      'selenium',
      'playwright',
      'jest',
      'junit',
      'appium',
      'k6',
    ],
  },
} as const satisfies Record<
  string,
  { label: string; terms: readonly string[] }
>;

export type Ecosystem = keyof typeof ECOSYSTEMS;
