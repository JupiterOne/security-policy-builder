FROM node:14.11.0
WORKDIR /opt
RUN apt-get update && apt-get install --assume-yes \
  aspell \
  jq \
  pandoc \
  python3-pip \
  texlive-base \
  texlive-fonts-extra \
  texlive-fonts-recommended \
  texlive-latex-extra \
  texlive-xetex
RUN npm install -g \
  markdownlint-cli

# These make their respective commands work as 'docker run' arguments
COPY bin/docker-mkdocs /usr/local/bin/mkdocs
COPY bin/docker-psp /usr/local/bin/psp
RUN chmod +x /usr/local/bin/mkdocs /usr/local/bin/psp

### NOTE: there appears to be an undocumented edge-case preventing Debian9 from
# succesfully installing mkdocs with python3. Here, we're explicitly copying the
# dependencies from the squidfunk/mkdocs-material image, which should always
# JustWork
RUN python3 -m pip install --no-cache-dir importlib_metadata
COPY --from=squidfunk/mkdocs-material:5.5.12 /usr/local/lib/python3.8/site-packages/ /usr/local/lib/python3.5/dist-packages/

RUN mkdir /work
COPY . /work
WORKDIR /work
RUN yarn install
RUN yarn bundle
COPY dist /opt
RUN rm -rf /work
WORKDIR /opt
