# InfoSec Policies, Standards and Procedures (PSP) Builder

A CLI tool for building and publishing an organization's full policies,
standards, and procedures (PSPs) in support of modern security operations and
compliance.

The output format is Markdown. For instructions on converting markdown to other
formats like HTML and PDF, see notes below.

First-time users of the tool can choose one of the execution methods below and
run `psp build` to be interactively prompted for configuration values. This will
generate a `config.json` file that may be used to speed-up future invocations.

JupiterOne users with existing content may begin using the CLI by downloading
the PSP zip file in the Policies app.

## Installing the policybuilder

### Using NPM

Run the following command to install the policy builder locally using NPM.

```bash
npm install -g @jupiterone/security-policy-builder
```

If you do not have Node and/or NPM installed locally, you may do so via:

#### Installing NVM and Node

1. Install NVM with:
   `curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash`
1. Install Node with `nvm install stable`

### Using Docker

If you are comfortable using Docker, you can also use our
[Dockerhub pspbuilder image](https://hub.docker.com/r/jupiterone/pspbuilder), by
issuing the command:

```bash
docker pull jupiterone/pspbuilder
```

This will cache the docker image locally on your machine.

## Building your first set of policies

The first time you run the `psp build` command, you will be prompted for several
inputs, such as company name, to be included in your policy text. Save this to a
file, say `config.json`, when prompted. This will use the default
[policy templates](https://github.com/JupiterOne/security-policy-templates)
maintained by JupiterOne to render a basic, but fairly complete set of
information security policies and procedures.

`cd` into a directory where you would like your PSP files to reside (we
recommend keeping the generated `templates` directory--see below--under version
control!) and perform one of the following commands:

### Building from NPM script

If you installed from NPM above, issue:

```bash
psp build
```

### Building from docker image

If you're using the provided docker image, issue:

```bash
docker run -it -v "$PWD":/mnt --rm jupiterone/pspbuilder psp build -o /mnt/docs -p /mnt/partials -s /mnt/templates
```

### Output of `psp build`

Remember to save your config to a file, which you can reference the next time
you'd like to rebuild the policies and procedures with the `-c` or `--config`
option flag. This JSON document stores your `organization` template variables
referenced from documents in the `templates` folder, and also stores the
information architecture for your documents (how the policies and procedures
fragments should be stitched together). We recommended all policies available in
the default `config.json` to be adopted for your security program. The
`config.json` file includes the procedures/controls you choose to adopt, which
will be included in the final rendered policy docs by the tool.

The output of a successful first run will be the creation of three directories:

- `templates` - raw markdown templates that represent the source of truth for
  your policies and procedures.
- `partials` - partially rendered markdown fragments used to assemble the
  `docs`. This dir is intermediate output sometimes useful for debugging
  purposes, and may largely be ignored.
- `docs` - The final Markdown produced by the tool, assembled from `partials`
  fragments.

You will invariably want to edit these PSPs to reflect the specifics of your
organization's information security program. See "PSP Best Practices" below for
additional details on versioning and deployment.

**IMPORTANT:** To edit the policies and procedures, use the template files in
`./templates` and re-run the `psp build` command. Do _not_ edit the `./docs` and
`./partials` files directly as they will be overwritten on the next build.

### Building from existing/edited templates

Once you've edited your template files, you're ready to build again with:

```bash
psp build -t ./templates -c ./config.json

or

docker run -it -v "$PWD":/mnt --rm jupiterone/pspbuilder psp build -t /mnt/templates -o /mnt/docs -p /mnt/partials
```

## Publishing

The policybuilder tools supports publishing to JupiterOne and Confluence, via
the `publish` subcommand.

### Publishing policies and procedures to JupiterOne

If you have an account on the
[JupiterOne security platform](https://jupiterone.io), you can run the following
command to publish the contents of your policies and procedures to your
JupiterOne account, so that you and others in your organization can access them
online.

```bash
psp publish -c ./config.json -t ./templates -a $J1_ACCOUNT_ID -k $J1_API_TOKEN
```

or

```bash
docker run -it -v "$PWD":/mnt --rm jupiterone/pspbuilder psp publish -c /mnt/config.json -t /mnt/templates -a $J1_ACCOUNT_ID -k $J1_API_TOKEN
```

By default, the `psp publish` command will submit your data to JupiterOne as a
background job and immediately return. You can optionally add the `--wait`
option if you would like to wait for the background publishing work to complete.
When the `--wait` is used, the command polls JupiterOne until the task is
complete, and a full report of the publish job is printed to the console.

Your JupiterOne token must have `Policies:Admin` privilege, or be issued by an
account Administrator, in order to publish the contents.

### Publishing policies and procedures to Confluence

You can also publish the policies to a Confluence wiki space. Simply run the
`psp publish` command with the `--confluence` option.

```bash
psp publish --confluence
```

You will be prompted to enter your Confluence domain and space key, and
username/password:

```bash
? Confluence domain (the vanity subdomain before '.atlassian.net'):
? Confluence space key:
? Confluence username:
? Confluence password: [hidden]
Published 35 docs to Confluence.
```

Or, provide necessary configuration options for non-interactive publishing:

```bash
psp publish --confluence --site <subdomain> --space <KEY> --docs <path> -u <username/email> -k <key/password>
```

The program will save the page ID for each published policy document locally to
a file in the current directory: `confluence-pages.json`. Make sure this file is
**retained** because the program will use the page ID for each policy to update
the Confluence page the next time it is run.

_We recommend creating a dedicated wiki space for these security policies._

## PSP Best Practices

The PSPs supported by the tool are meant to be automatically generated from
source. We recommend the following practices:

### Versioning

We highly recommend you practice policy-as-code and version your `templates` dir
and `config.json` file. If you use `git` for version control, we recommend
putting the following in your project's `.gitignore`:

```
docs
partials
```

Doing this makes it obvious what is to be edited in order to update your PSPs,
and prevents confusion.

If your versioning system supports it, we recommend limiting merge authority to
authorized security staff only.

### CI/CD

Building and publishing the PSPs upon authorized merge to master branch is
supported via the `-n` or `--noninteractive` flags. Do something like:

```bash
#!/bin/bash
set -euo pipefail
cd to/cloned/repo

# build documentation
docker run -it -v "$PWD":/mnt --rm jupiterone/pspbuilder psp build -c /mnt/config.json -o /mnt/docs -t /mnt/templates --noninteractive

# publish templates to JupiterOne graph
docker run -it -v "$PWD":/mnt --rm jupiterone/pspbuilder psp publish -c /mnt/config.json -t /mnt/templates -a $J1_ACCOUNT_ID -k $J1_API_TOKEN --noninteractive

# generate static HTML in 'site' directory
# mkdocs command expects the YAML file to be at the root of the project
cp docs/mkdocs.yml .
docker run -it -v "$PWD":/mnt --rm jupiterone/pspbuilder mkdocs build -f /mnt/mkdocs.yml

# copy to static site host (here, AWS S3 bucket)
cd site
aws s3 cp --recursive . s3://mybucket/location
```

### Generating a static HTML site from Markdown

We recommend the `mkdocs` tool for this. See above example in "CI/CD" which does
`mkdocs build`.

## Advanced Usage

### Advanced JSON configuration

You may edit your `config.json` file directly to provide input to the
configurable questions. The `config.json` file contains the following sections:

`organization`

- You can edit this section directly to provide answers to the questions that
  are promptly by the `psp-builder` CLI.
- You can also add your own custom variables in this section -- e.g.
  `"variableName": "value"`. You will need to make sure to add the same
  variable(s) to your templates in the format of `{{variableName}}`.
- Note that if the variable is a URL/URI, you will need to add the `&` symbol to
  your variables in the templates -- e.g. `{{&variableURL}}`.

`standards`

- Contains references to various compliance standards and frameworks.
- **DO NOT** edit this section.

`policies`

- Contains all available policies and the corresponding procedures that
  implements and enforces each policy.
- It is recommended that all policies to be included in your security program
  and documentation, therefore, you should **NOT** edit this section.

`procedures`

- Contains the individual procedure documentations.
- Each procedure includes the following

  - A `summary` to provide high level guidance about that particular procedure
    and its implementation. This is for your reference.
  - A set of `resources` that will help with implementation and/or selecting a
    third party vendor solution.
  - A `provider` property, pre-populated with the recommended solution, if
    applicable. You may update this to the solution you have actually selected.
    The policy builder will update the documentation text within that procedure
    accordingly.
  - If you choose to exclude a procedure from your final policy documentation,
    you may set the `adopted` flag to `false`. The policy builder with skip
    those when compiling the policies.

### Build Local Docker Image

If you'd prefer not to use the image provided by DockerHub, you may build your
own docker image by cloning this repository, and running:

```
docker build -t pspbuilder .
```

### Preview Mkdocs Output Locally

The static HTML files generated by mkdocs (see "CI/CD" above for example) may be
viewed locally by doing:

1. `cd site`
1. `python3 -m http.server 8000`
1. `open http://localhost:8000`

### Install Mkdocs Locally

Note: local mkdocs usage is not supported.

```bash
pip install --upgrade pip
pip install mkdocs mkdocs-material
```

See http://www.mkdocs.org for more info. Additionally, mkdocs is configured to
use the `mkdocs-material` theme. Instructions
[can be found here](https://squidfunk.github.io/mkdocs-material/getting-started/).

### Generating PDF and Word Documents

`Pandoc` can be used to automatically convert the markdown files into PDF or
Word documents.

#### Pandoc Conversion Using Docker Image

The supported `jupiterone/pspbuilder` docker image has the necessary pandoc
dependencies installed. You may issue commands like:

```bash
docker run -it -v "$PWD":/mnt --rm jupiterone/pspbuilder-extras pandoc /mnt/docs/filename.md -f markdown -t latex --pdf-engine=xelatex --variable monofont="Monaco" -o /mnt/pdf/filename.pdf
```

to convert a single markdown file into a PDF.

#### Local Pandoc Installation Steps for MacOS

NOTE: Local pandoc usage is not supported.

To install and configure `pandoc` locally on your system, follow the
installation instructions here:
[pandoc.org/installing.html](https://pandoc.org/installing.html)

or issue the following commands:

Install **Pandoc**:

```bash
brew install pandoc
```

Install **pandoc-latex-admonition**, which is a pandoc filter for adding
admonition:

```bash
pip install pandoc-latex-admonition
```

Download and install **LaTex**, or
[MacTeX](http://www.tug.org/mactex/morepackages.html). The smaller distribution,
BasicTeX is sufficient, but additional packages are required:

```bash
sudo tlmgr install collection-fontsrecommended
sudo tlmgr install mdframed
sudo tlmgr install needspace
sudo tlmgr install ucharcat
sudo tlmgr install tcolorbox
sudo tlmgr install environ
sudo tlmgr install trimspaces
```

NOTE: on macOS systems, you will likely also need to install XeLaTeX from here:
[http://www.texts.io/support/0001/](http://www.texts.io/support/0001/)

Start a new terminal session to ensure `pandoc` runs. Note that some UTF-8
characters
[may not be supported out-of-the-box](https://stackoverflow.com/questions/18178084/pandoc-and-foreign-characters).
The `--pdf-engine=xelatex --variable monofont="Monaco"` options help, but other
fonts may be required if your content needs them.

**Example script for generating individual PDF policy documents:**

```bash
#!/bin/bash
cd ./docs
mkdir pdf
for filename in *.md; do
  echo $filename
  pandoc $filename -f markdown -t latex --pdf-engine=xelatex --variable monofont="Monaco" -o ./pdf/$filename.pdf
done
```

**Example script for generating a combined PDF policy document, using Docker:**

Create a small bash script, called `pdf.sh`:

```bash
#!/bin/bash
cd /mnt
mkdir pdf
cd /mnt/docs
pandoc *.md -f markdown -t latex --latex-engine=xelatex --variable monofont="inconsolata" --toc -o /mnt/pdf/infosec-policies.pdf
```

Then, issue:

```bash
docker run -it -v "$PWD":/mnt --rm jupiterone/pspbuilder-extras /mnt/pdf.sh
```

This should stitch together all of your markdown files (in alphabetical order
returned by the bash glob, `*`). You could replace this with individual ordering
of file arguments if you wanted more control of the sequencing.

**Example script for generating Word documents:**

```bash
mkdir docx
pandoc model.md *.md -f markdown -t docx --toc -o ./docx/infosec-policies.docx
```

### Generating Self Assessment Reports

The current version of the policy builder supports generating a lightweight
HIPAA self assessment report, based on a few key questions and the adoption of
policies and procedures.

```bash
./bin/psp assess --standard hipaa --config <location_of_your_json_config_file> [options]
```

The above command generates a HIPAA self assessment report in the
`./assessments` directory. The report contains mapping of your adopted
policies/procedures to each specific HIPAA regulation requirement. It also
contains placeholders, where applicable, for you to provide additional details.
Gaps identified will be called out in the command line output as well as in the
report itself.
