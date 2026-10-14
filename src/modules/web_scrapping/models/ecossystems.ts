// Termos em minúsculas, já normalizados (labels do GitHub e variações comuns).
// Cada termo pertence a um só ecossistema e o identifica sozinho: nada de
// siglas curtas que casam com outras palavras ('js', 'c', 'ia') nem
// ferramentas que aparecem em qualquer vaga (vite, jest, linux, sql).
export const ECOSYSTEMS = {
  java: {
    label: 'Java',
    terms: [
      'java',
      'spring',
      'spring boot',
      'quarkus',
      'micronaut',
      'hibernate',
      'jpa',
      'jakarta ee',
    ],
  },
  javascript: {
    label: 'JavaScript / TypeScript',
    terms: ['javascript', 'typescript'],
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
      'deno',
    ],
  },
  react: {
    label: 'React',
    terms: ['react', 'next.js', 'redux', 'react query', 'remix'],
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
    terms: ['c#', '.net', 'asp.net', 'entity framework', 'blazor', '.net maui'],
  },
  php: {
    label: 'PHP',
    terms: ['php', 'laravel', 'symfony', 'codeigniter', 'wordpress'],
  },
  ruby: {
    label: 'Ruby',
    terms: ['ruby', 'ruby on rails', 'rails', 'sidekiq'],
  },
  go: {
    label: 'Go',
    terms: ['go', 'golang', 'gin', 'gorm'],
  },
  rust: {
    label: 'Rust',
    terms: ['rust', 'tokio', 'actix', 'axum'],
  },
  cpp: {
    label: 'C / C++',
    terms: ['c++', 'linguagem c', 'qt', 'cmake', 'stl'],
  },
  embarcados: {
    label: 'Embarcados / IoT',
    terms: [
      'sistemas embarcados',
      'embedded',
      'firmware',
      'microcontroladores',
      'rtos',
      'arduino',
      'esp32',
      'iot',
    ],
  },
  android: {
    label: 'Android',
    terms: ['android', 'kotlin', 'jetpack compose'],
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
    label: 'Dados / BI',
    terms: [
      'engenharia de dados',
      'análise de dados',
      'power bi',
      'tableau',
      'etl',
      'spark',
      'airflow',
      'dbt',
      'databricks',
      'data warehouse',
      'dba',
    ],
  },
  ia: {
    label: 'IA / Machine Learning',
    terms: [
      'inteligência artificial',
      'machine learning',
      'deep learning',
      'llm',
      'pytorch',
      'tensorflow',
      'scikit-learn',
      'langchain',
      'nlp',
      'visão computacional',
    ],
  },
  devops: {
    label: 'DevOps / Cloud',
    terms: [
      'devops',
      'sre',
      'docker',
      'kubernetes',
      'aws',
      'azure',
      'gcp',
      'terraform',
      'ansible',
      'ci/cd',
      'jenkins',
      'github actions',
    ],
  },
  qa: {
    label: 'QA / Testes',
    terms: [
      'qa',
      'testes automatizados',
      'testes manuais',
      'cypress',
      'selenium',
      'playwright',
      'appium',
      'k6',
    ],
  },
  uiux: {
    label: 'UI / UX Design',
    terms: [
      'ui/ux',
      'ux/ui',
      'ui design',
      'ux design',
      'product design',
      'design de interface',
      'experiência do usuário',
      'design system',
      'figma',
      'adobe xd',
      'pesquisa com usuários',
    ],
  },
} as const satisfies Record<
  string,
  { label: string; terms: readonly string[] }
>;

export type Ecosystem = keyof typeof ECOSYSTEMS;
