export interface GithubUser {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  user_view_type: string;
  site_admin: boolean;
}

export interface GithubLabel {
  id: number;
  node_id: string;
  url: string;
  name: string;
  color: string;
  default: boolean;
  description: string | null;
  archived_at: string | null;
  archived_by: GithubUser | null;
}

export interface GithubReactions {
  url: string;
  total_count: number;
  '+1': number;
  '-1': number;
  laugh: number;
  hooray: number;
  confused: number;
  heart: number;
  rocket: number;
  eyes: number;
}

export interface GithubIssue {
  url: string;
  repository_url: string;
  labels_url: string;
  comments_url: string;
  events_url: string;
  html_url: string;
  id: number;
  node_id: string;
  number: number;
  title: string;
  user: GithubUser;
  labels: GithubLabel[];
  state: 'open' | 'closed';
  locked: boolean;
  assignee: GithubUser | null;
  assignees: GithubUser[];
  milestone: unknown;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  author_association: string;
  issue_field_values: unknown[];
  type: unknown;
  active_lock_reason: string | null;
  sub_issues_summary: {
    total: number;
    completed: number;
    percent_completed: number;
  };
  issue_dependencies_summary: {
    blocked_by: number;
    total_blocked_by: number;
    blocking: number;
    total_blocking: number;
  };
  body: string | null;
  closed_by: GithubUser | null;
  reactions: GithubReactions;
  timeline_url: string;
  performed_via_github_app: unknown;
  state_reason: 'completed' | 'not_planned' | 'reopened' | null;
  pinned_comment: unknown;
}
