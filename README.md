# Canvas module sharer

> An app that lets you easily share your entire teacher's resources with others.

## Features
- **Find Modules By ID** - You can easily look up modules by ID from the main page or just share the link.
- **Collapsible Sections** - Collapse main categories and pages by clicking on them. This will stay between reloads.
- **Admin Page** - A password protected admin page to update and delete modules by ID.
- **download files** - any PDFs or other files can be downloaded without auth.

## Limitations
- Google drive stuff might not work due to permission problems but there is no bypass there.

## How to use
1. go to the main page of _ to add or go to a module
2. go to _/admin?password={password} to go to the admin page. you will have to re-enter your password to do stuff

## How to self host
1. rename .env.example to .env and put in your port and admin password
2. run ```npm start```