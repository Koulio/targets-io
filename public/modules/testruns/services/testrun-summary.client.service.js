'use strict';
//Events service used to communicate Events REST endpoints
angular.module('testruns').factory('TestRunSummary', [
  '$http',
  'Products',
  'Dashboards',
  'Events',
  function ($http, Products, Dashboards, Events) {
    var TestRunSummary = {

      addTestRunSummary: addTestRunSummary,
      updateTestRunSummary: updateTestRunSummary,
      deleteTestRunSummary: deleteTestRunSummary,
      getTestRunSummary: getTestRunSummary,
      getTestRunSummaryForRelease: getTestRunSummaryForRelease,
      getTestRunSummariesForRelease: getTestRunSummariesForRelease,
      getTestRunSummaryReleasesForProduct: getTestRunSummaryReleasesForProduct
      //listTestRunsSummariesForProductRelease:listTestRunsSummariesForProductRelease

    };
    return TestRunSummary;

    //function listTestRunsSummariesForProductRelease(productName, productRelease) {
    //  return $http.get('/testruns-product-release/' + productName + '?release=' + productRelease);
    //}

    function getTestRunSummary(productName, dashboardName, testRunId){

      return $http.get('/testrun-summary/' + productName + '/' + dashboardName + '/' + testRunId.toUpperCase());

    }
    function getTestRunSummaryForRelease(productName, dashboardName, testRunId){

      return $http.get('/testrun-summary-release/' + productName + '/' + dashboardName + '/' + testRunId);

    }

    function getTestRunSummariesForRelease(productName, testRunIdsArray){

      return $http.post('/testrun-summaries-release/' + productName, testRunIdsArray);

    }
    function getTestRunSummaryReleasesForProduct(productName){

      return $http.get('/testrun-summaries-releases-product/' + productName);

    }
    function addTestRunSummary(testRunSummary){
      return $http.post('/testrun-summary', testRunSummary);
    }

    function updateTestRunSummary(testRunSummary){

      return $http.put('/testrun-summary/', testRunSummary);

    }

    function deleteTestRunSummary(testRunSummary) {
      return $http.delete('/testrun-summary/' + testRunSummary.productName + '/' + testRunSummary.dashboardName + '/' + testRunSummary.testRunId);
    }


  }
]);
