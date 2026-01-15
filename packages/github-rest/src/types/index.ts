export interface Owner {
  login: string;
}

export interface Permissions {
  admin?: boolean;
  push?: boolean;
  pull?: boolean;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  owner: Owner;
  fork: boolean;
  archived: boolean;
  private?: boolean;
  template?: boolean;
  size: number;
  html_url: string;
  pushed_at?: string | null;
  language?: string | null;
  topics?: string[];
  permissions?: Permissions;
  default_branch?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  hasNext: boolean;
  nextPage?: number;
  headers: Record<string, string>;
}
