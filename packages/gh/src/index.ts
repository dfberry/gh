export function helloWorld(): string {
  return 'Hello from gh-sdk!';
}

export {
  getDependabotAlerts,
  type DependabotAlert,
  type GetDependabotAlertsParams,
} from './dependabotAlerts.js';

export {
  searchRepos,
  type Repository,
  type SearchReposParams,
  type SearchReposResult,
} from './repos.js';

export {
  listUserRepos,
  listOrgRepos,
  listAuthenticatedUserRepos,
  listAllUserRepos,
  listAllOrgRepos,
  listUserReposPaginated,
  listOrgReposPaginated,
  listAuthenticatedUserReposPaginated,
  listUserReposByLanguage,
  searchReposByTopic,
  type ListReposParams,
  type PaginatedResult,
} from './repos.js';
