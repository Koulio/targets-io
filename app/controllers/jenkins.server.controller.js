'use strict';
/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
    fs = require('fs'),
    config = require('../../config/config'),
    _ = require('lodash'),
    winston = require('winston'),
    request = require('request'),
    config = require('../../config/config'),
    GatlingDetails = mongoose.model('GatlingDetails');

exports.getjenkinsUrl = getjenkinsUrl;
exports.getJenkinsData = getJenkinsData;
exports.getJenkinsJobs = getJenkinsJobs;
exports.getConsoleData = getConsoleData;
exports.getJenkinsJobStatus = getJenkinsJobStatus;
exports.startJob = startJob;
exports.stopJob = stopJob;
exports.login = login;


function getjenkinsUrl(req, res){

  var jenkinsUrl = {
    jenkinsUrl: config.jenkinsUrl
  }
  res.jsonp(jenkinsUrl);
}


function stopJob(req, res){

  var options = {
    headers: {
      'Authorization': req.header('Authorization')
    }
  };

  /* if Jenkins is running on SSL */
  if(config.jenkinsSSL){

    options['rejectUnauthorized'] =  true;
    options['requestCert'] =  true;
    options['agent'] =  false;
  }

  /* if Jenkins is using a self-signed certificate */
  if(config.jenkinsCaFile) {

    options['ca'] = fs.readFileSync(config.jenkinsCaFile);

  }



  var jenkinsJobsUrl = config.jenkinsUrl + '/job/' + req.params.jenkinsJobName + '/api/json?pretty=true&depth=1';
  var jenkinsCrumbsUrl = config.jenkinsUrl + '/crumbIssuer/api/json';

  request.get(jenkinsJobsUrl, options, function (err, response, body) {
    if (err) {
      res.send(400, {message : response.data})
    } else {

      if(JSON.parse(body).inQueue === false){

        var jenkinsStopUrl = config.jenkinsUrl + '/job/' + req.params.jenkinsJobName + '/' + JSON.parse(body).builds[0].number + '/stop' ;

      }else{

        var jenkinsStopUrl = config.jenkinsUrl + '/queue/cancelItem?id=' + JSON.parse(body).queueItem.id ;

      }

      request.get(jenkinsCrumbsUrl, options, function (err, response, body) {

        if (err) {
          res.send(400, {message : response.data})
        } else {


          options.headers = {

            'Jenkins-Crumb': response.statusCode === 200 ? JSON.parse(body).crumb : 'no crumb',
            'Authorization': req.header('Authorization')


          }

          request.post(jenkinsStopUrl, options, function (err, response, stopBody) {
            if (err) {
              res.send(400, {message: response.data})
            } else {

              res.jsonp({"statusCode":response.statusCode, "body": response.statusCode === 200 ? JSON.parse(stopBody) : stopBody });
            }
          });
        }
      });

    }
  });


}
function startJob(req, res){

  var options = {
    headers: {
      'Authorization': req.header('Authorization')
    }
  };

  /* if Jenkins is running on SSL */
  if(config.jenkinsSSL){

    options['rejectUnauthorized'] =  true;
    options['requestCert'] =  true;
    options['agent'] =  false;
  }

  /* if Jenkins is using a self-signed certificate */
  if(config.jenkinsCaFile) {

    options['ca'] = fs.readFileSync(config.jenkinsCaFile);

  }


  var jenkinsCrumbsUrl = config.jenkinsUrl + '/crumbIssuer/api/json';
  var jenkinsJobsUrl = config.jenkinsUrl + '/job/' + req.params.jenkinsJobName + '/build' ;

  request.get(jenkinsCrumbsUrl, options, function (err, response, body) {

    if (err) {
      res.send(400, {message : response.err})
    } else {


      options.headers ={

        'Jenkins-Crumb': response.statusCode === 200 ? JSON.parse(body).crumb : 'no crumb',
        'Authorization': req.header('Authorization')


      }

      request.post(jenkinsJobsUrl, options, function (err, response, startBody) {
         if (err) {
           res.send(400, {message: response.data})
         } else {

           res.jsonp({"statusCode":response.statusCode, "body": response.statusCode === 200 ? JSON.parse(startBody) : startBody });
         }
       });
    }
  });

}


function getJenkinsJobStatus (req, res) {

  var options = {
    headers: {
      'Authorization': req.header('Authorization')
    }
  };

  /* if Jenkins is running on SSL */
  if(config.jenkinsSSL){

    options['rejectUnauthorized'] =  true;
    options['requestCert'] =  true;
    options['agent'] =  false;
  }

  /* if Jenkins is using a self-signed certificate */
  if(config.jenkinsCaFile) {

    options['ca'] = fs.readFileSync(config.jenkinsCaFile);

  }

  var jenkinsJobsUrl = config.jenkinsUrl + '/job/' + req.params.jenkinsJobName + '/api/json?pretty=true&depth=1';

  request.get(jenkinsJobsUrl, options, function (err, response, body) {
    if (err) {
      res.send(400, {message : err})
    } else {

        res.jsonp({"statusCode":response.statusCode, "body": response.statusCode === 200 ? JSON.parse(body) : body });


    }
  });
}

function login (req, res) {

  var options = {
    headers: {
      'Authorization': req.header('Authorization')
    }
  };

  /* if Jenkins is running on SSL */
  if(config.jenkinsSSL){

    options['rejectUnauthorized'] =  true;
    options['requestCert'] =  true;
    options['agent'] =  false;
  }

  /* if Jenkins is using a self-signed certificate */
  if(config.jenkinsCaFile) {

    options['ca'] = fs.readFileSync(config.jenkinsCaFile);

  }

  var jenkinsLoginsUrl = config.jenkinsUrl + '/j_acegi_security_check';

  request.get(jenkinsLoginsUrl, options, function (err, response, body) {
    if (err) {
      res.send(400, {message : response.data})
    } else {

        var loginFailed = new RegExp('loginError');

        if(response.headers.location.test(loginFailed)){
          res.jsonp({"authenticated": false});
        }else{
          res.jsonp({"authenticated": true});

        }



    }
  });
}
  function getJenkinsJobs (req, res){


    /* if user and password are provided, add those as authentication */

    var options;
    if (config.jenkinsUser && config.jenkinsPassword){

      options = {
        auth: {
          user: config.jenkinsUser,
          pass: config.jenkinsPassword,
          sendImmediately: true

        }
      }

    }else{

      options = {};
    }

    /* if Jenkins is running on SSL */
    if(config.jenkinsSSL){

      options['rejectUnauthorized'] =  true;
      options['requestCert'] =  true;
      options['agent'] =  false;
    }

    /* if Jenkins is using a self-signed certificate */
    if(config.jenkinsCaFile) {

      options['ca'] = fs.readFileSync(config.jenkinsCaFile);

    }

  var jenkinsJobsUrl = config.jenkinsUrl + '/api/json';


  request.get(jenkinsJobsUrl, options, function (err, response, body) {
    if (err) {
      res.send(400, {message : response.data})
    } else {

      res.jsonp({"statusCode":response.statusCode, "body": response.statusCode === 200 ? JSON.parse(body) : body });
    }
  });
}


function getConsoleData (req, res) {


  /* first check if response is available in db */
  GatlingDetails.findOne({consoleUrl: req.body.consoleUrl},function(err, GatlingDetailsResponse) {

    if (GatlingDetailsResponse) {

      winston.info('Gatling details served from db');
      res.jsonp(GatlingDetailsResponse.response);

    } else {

      winston.info('Gatling details served from Jenkins');
      getJenkinsData(req.body.consoleUrl, req.body.running, req.body.start, req.body.end, req.body.productName, req.body.dashboardName, function (response) {

        if(response.status === 'fail'){

          res.send(400, {message : response.data})

        }else {
          res.jsonp(response);
        }
      });
    }
  });


};

function getJenkinsData (jenkinsUrl, running, start, end, productName, dashboardName, callback) {
  var consoleResponse = {};
  var consoleData = [];
  var errorData = [];
  var consoleUrl;
  var separator;
  /*
   * we use a different url if a test is still running
   * */
  if (running === false) {
    consoleUrl = jenkinsUrl + 'console';
    separator = '&gt; ';
  } else {
    consoleUrl = jenkinsUrl + 'logText/progressiveText?start=';
    separator = '> ';
  }

  /* if user and password are provided, add those as authentication */

  var options;

  if (config.jenkinsUser && config.jenkinsPassword){

    options = {
      auth: {
        user: config.jenkinsUser,
        pass: config.jenkinsPassword,
        sendImmediately: true,


      },
      

  }

  }else{

    options = {};
  }


  /* if Jenkins is running on SSL */
  if(config.jenkinsSSL){

    options['rejectUnauthorized'] =  true;
    options['requestCert'] =  true;
    options['agent'] =  false;
  }

  /* if Jenkins is using a self-signed certificate */
  if(config.jenkinsCaFile) {

    options['ca'] = fs.readFileSync(config.jenkinsCaFile);

  }


  request.get(consoleUrl, options, function (err, response, body) {
    if (err) {
      winston.error(err);
    } else {

      if (response.statusCode !== 200) {

        if  (response.statusCode === 401) winston.error('Jenkins authorization failed, please update your credentials');
        else winston.error('Jenkins call failed with statuscode: ' + response.statusCode);

        consoleResponse.status = 'fail';
        consoleResponse.data = err;
        callback(consoleResponse);

      } else {

        var endTestPattern = new RegExp('finished|completed|Build was aborted');

        var consoleArrayFirstSplit = body.split(endTestPattern);
        var consoleArray = consoleArrayFirstSplit[0].split('Requests');
        if (consoleArray.length > 1) {

          var consoleResultsArray = consoleArray[consoleArray.length - 1].split(endTestPattern);

          var consoleLineArray = consoleResultsArray[0].split(separator);
          //            winston.info(body);
          _.each(consoleLineArray, function (consoleLine, i) {
            if (i > 0) {
              var request = /(.*?)\s+\(OK.*/g.exec(consoleLine);
              if (request) {
                var OK = /.*OK=(\d+)\s+KO.*/.exec(consoleLine);
                var KO = /.*KO=(\d+).*/.exec(consoleLine);
                var percFailed = parseInt(OK[1]) + parseInt(KO[1]) > 0 ? (parseInt(KO[1]) * 100 / (parseInt(OK[1]) + parseInt(KO[1]))).toFixed(2).toString() + '%' : '0%';
                consoleData.push({
                  'request': request[1],
                  'OK': parseInt(OK[1]),
                  'KO': parseInt(KO[1]),
                  'percFailed': percFailed
                });
              } else {
                var percentageOfErrors = /.*\(\s?(\d+\.\d+%)\)\s/g.exec(consoleLine);
                if (percentageOfErrors) {
                  var error1 = /(.*?)\s+\d+\s\(\s?\d+\.\d+%\)\s/g.exec(consoleLine);
                  var error2 = /.*\s+\d+\s\(\s?\d+\.\d+%\)\s+([^\=-]*)/g.exec(consoleLine);
                  var error = (error2[1] !== '') ? error1[1] + error2[1] : error1[1];
                  var numberOfErrors = /.*\s+(\d+)\s\(\s?\d+\.\d+%\)/g.exec(consoleLine);
                  errorData.push({
                    'error': error,
                    'numberOfErrors': parseInt(numberOfErrors[1]),
                    'percentageOfErrors': percentageOfErrors[1]
                  });
                }
              }
            }
          });

          consoleResponse.status = 'OK';
          consoleResponse.data = consoleData;
          consoleResponse.errors = errorData;
        }
        callback(consoleResponse);

        /* if test is finished, put response  in db */
        if (running === false && consoleResponse.hasOwnProperty('data')) {

          var GatlingDetailsResponse = new GatlingDetails({productName: productName, dashboardName: dashboardName, consoleUrl: jenkinsUrl, response: consoleResponse});
          GatlingDetailsResponse.save(function (err, savedResponse) {
            if (err) winston.error(err);
          });
        }
      }
    }
  })
}
