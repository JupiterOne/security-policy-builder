# Amazon Cognito Identity SDK for JavaScript for Node.js

This module is a fork of [amazon-cognito-identity-js](https://github.com/aws/amazon-cognito-identity-js) and applicable to Node.js

## Install
```sh
npm install amazon-cognito-identity-js-node
```

## Usage
```sh
var AWS = require('aws-sdk');
var CognitoSDK = require('amazon-cognito-identity-js-node');

AWS.CognitoIdentityServiceProvider.AuthenticationDetails = CognitoSDK.AuthenticationDetails;
AWS.CognitoIdentityServiceProvider.CognitoUserPool = CognitoSDK.CognitoUserPool;
AWS.CognitoIdentityServiceProvider.CognitoUser = CognitoSDK.CognitoUser;
```
