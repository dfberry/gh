export * as pullRequests from './endpoints/pull-requests.js';
export * as repos from './endpoints/repos.js';
export * as permissions from './endpoints/permissions.js';
export * as prcomments from './endpoints/user-pr-comments.js';
export * as actions from './endpoints/actions.js';
export * as user from './endpoints/user.js';
export * as security from './endpoints/security.js';

export { GitHubClient } from './core/client.js';
export * as errors from './core/errors.js';
export * as auth from './core/auth.js';
export { getActorWithScopeCheck } from './core/auth.js';
export { createGitHubClient } from './core/factory.js';

export * as types from './types/index.js';

export * as pagination from './pagination/index.js';

// remove after upstream adoption is fixed
export { getPullRequestComments } from './endpoints/pull-requests.js';
export { getRepoPermissions, hasAdminPermission } from './endpoints/permissions.js';
export { findEmptyRepos, createUserRepo, createOrgRepo, listPullRequests, createPullRequest } from './endpoints/repos.js';
export { getUserPrComments } from './endpoints/user-pr-comments.js';