FROM node:10 as pspbuilder
WORKDIR /opt
RUN apt-get update && apt-get install --assume-yes python3-pip && pip3 install mkdocs mkdocs-material
COPY bin/docker-mkdocs /usr/local/sbin/mkdocs
COPY bin/docker-psp /usr/local/bin/psp
RUN chmod +x /usr/local/sbin/mkdocs /usr/local/bin/psp
