FROM node:14.16.0-stretch-slim
WORKDIR /opt

# Install pandoc and other linting/helper tools
RUN apt-get update && apt-get install --assume-yes \
  python3-pip

# Install psp CLI and additional linting tool
RUN npm install -g \
  @jupiterone/security-policy-builder

# Install Mkdocs

### NOTE: there appears to be an undocumented edge-case preventing Debian9 from
# succesfully installing mkdocs with python3. Here, we're explicitly copying the
# dependencies from a pinned squidfunk/mkdocs-material image, which should
# always 'just work'
RUN python3 -m pip install --no-cache-dir importlib_metadata
COPY --from=squidfunk/mkdocs-material:5.5.12 /usr/local/lib/python3.8/site-packages/ /usr/local/lib/python3.5/dist-packages/

# This makes the 'mkdocs' command work as a 'docker run' argument
COPY bin/docker-mkdocs /usr/local/bin/mkdocs
RUN chmod +x /usr/local/bin/mkdocs