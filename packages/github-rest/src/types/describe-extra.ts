export interface Contributor {
  login: string;
  id: number;
  contributions?: number;
}

export interface Release {
  id: number;
  tag_name: string;
  name?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string | null;
  html_url?: string;
}

export interface ContentFile {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  name: string;
  path: string;
  sha: string;
  size?: number;
  encoding?: string;
  content?: string;
}

export interface Label {
  id: number;
  name: string;
  color?: string;
  description?: string | null;
}

export interface UserProfile {
  login: string;
  name?: string | null;
  id: number;
  html_url?: string;
  bio?: string | null;
}
