#!/bin/bash
case "$1" in
  *[Uu]sername*) echo "oauth2" ;;
  *) echo "$GITHUB_PERSONAL_ACCESS_TOKEN" ;;
esac
