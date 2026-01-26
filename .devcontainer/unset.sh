# backup
sudo cp /etc/environment /etc/environment.bak

# delete any GIT_* lines
sudo sed -i '/^GIT_COMMITTER_NAME=/d; /^GIT_COMMITTER_EMAIL=/d; /^GIT_AUTHOR_NAME=/d; /^GIT_AUTHOR_EMAIL=/d' /etc/environment

# remove from current shell session
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL

# verify none remain
env | grep -i '^GIT_' || true

# retry commit
git add .
git commit -m "fix: devcontainer and plan location"