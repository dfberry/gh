#!/bin/bash

# On host machine, set the following environment variables to your GitHub username and email
# export GIT_COMMITTER_NAME="YOUR-GITHUB-USERNAME"
# export GIT_COMMITTER_EMAIL="YOUR-GITHUB-EMAIL"


# Set Git user.name and user.email from environment variables if available
if [[ -n "$GIT_COMMITTER_NAME" && -n "$GIT_COMMITTER_EMAIL" ]]; then
  git config --global user.name "$GIT_COMMITTER_NAME"
  git config --global user.email "$GIT_COMMITTER_EMAIL"
  echo "Git user.name and user.email set from environment variables."
else
  echo "GIT_COMMITTER_NAME and/or GIT_COMMITTER_EMAIL not set. Skipping Git config."
fi