# get-user-comments

Fetch a GitHub user's PR comments for a repo, filtered by time and file path, and save to JSON.

## Usage

1. Set your GitHub token in the root `.env` file:
   ```
   GH_TOKEN=your_github_token
   ```
2. Build the project:
   ```
   npm run build
   ```
3. Run the script:
   ```
   npm start -- <owner> <repo> <username> [since] [until] [filePathFilter]
   ```
   - `owner`: Repository owner
   - `repo`: Repository name
   - `username`: GitHub username
   - `since` (optional): ISO date string
   - `until` (optional): ISO date string
   - `filePathFilter` (optional): Substring to filter file paths

## Output

Saves comments to a file named `comments-<owner>-<repo>-<username>.json` in the current directory.
