PROJ_DIR       := $(shell git rev-parse --show-toplevel)
PLATFORM       := osx
VERSION        := $(shell node -e "console.log(require('./package').version)")
ZIPFILE        := psp-builder-$(VERSION)-$(PLATFORM).zip
DOCKER_ZIPFILE := psp-builder-$(VERSION)-docker.zip
SEDFILE        := $(PROJ_DIR)/relocatable_venv.sed
DEFAULT_TEMPLATES := node_modules/@jupiterone/security-policy-templates/templates

all: $(ZIPFILE)

dockerzip: prod_node_modules
	cp $(PROJ_DIR)/$(DEFAULT_TEMPLATES)/config.json $(PROJ_DIR)
	zip -r $(DOCKER_ZIPFILE) package.json node_modules bin commands lib partials static Dockerfile .dockerignore LICENSE README.md config.json docker-mkdocs.yml
	[ -d node_modules.bak ] && mv node_modules.bak node_modules
	rm $(PROJ_DIR)/config.json

$(ZIPFILE): prod_node_modules relocatable_venv.activate
	cp $(PROJ_DIR)/$(DEFAULT_TEMPLATES)/config.json $(PROJ_DIR)
	zip -r $(PROJ_DIR)/$(ZIPFILE) bin commands env lib node_modules static package.json config.json README.md LICENSE .nvmrc
	[ -d node_modules.bak ] && mv node_modules.bak node_modules
	rm $(PROJ_DIR)/config.json

prod_node_modules:
	[ -d node_modules ] && mv node_modules node_modules.bak
	yarn install --prod

relocatable_venv.activate: env/bin/mkdocs
	virtualenv --relocatable env
	sed -f $(SEDFILE) env/bin/activate > $@
	cp $@ env/bin/activate

env/bin/mkdocs: env
	source $(PROJ_DIR)/env/bin/activate && pip install mkdocs mkdocs-material

env:
	virtualenv --system-site-packages env

clean:
	[ -d $(PROJ_DIR)/env ] && rm -rf $(PROJ_DIR)/env $(PROJ_DIR)/relocatable_venv.activate $(ZIPFILE)

mkdocs: env/bin/mkdocs

.PHONY: clean mkdocs prod_node_modules
