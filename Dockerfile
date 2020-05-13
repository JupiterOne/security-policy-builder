FROM node:10 as pspbuilder
WORKDIR /opt
RUN apt-get update && apt-get install --assume-yes python3-pip pandoc texlive-base texlive-fonts-recommended texlive-fonts-extra texlive-latex-extra texlive-xetex jq aspell
RUN pip3 install mkdocs mkdocs-material pandoc-latex-admonition
RUN npm install -g markdownlint-cli
COPY bin/docker-mkdocs /usr/local/sbin/mkdocs
COPY bin/docker-psp /usr/local/bin/psp
COPY . .
RUN yarn install
RUN chmod +x /usr/local/sbin/mkdocs /usr/local/bin/psp
