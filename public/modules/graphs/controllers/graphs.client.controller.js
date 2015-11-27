'use strict';
angular.module('graphs').controller('GraphsController', [
  '$scope',
  '$modal',
  '$rootScope',
  '$state',
  '$stateParams',
  'Dashboards',
  'Graphite',
  'TestRuns',
  'Metrics',
  '$log',
  'Tags',
  'ConfirmModal',
  'Utils',
  'SideMenu',
  function ($scope, $modal, $rootScope, $state, $stateParams, Dashboards, Graphite, TestRuns, Metrics, $log, Tags, ConfirmModal, Utils, SideMenu) {

    $scope.productName = $stateParams.productName;
    $scope.dashboardName = $stateParams.dashboardName;

    /* Set product Filter in side menu */
    SideMenu.productFilter = $stateParams.productName;
    $scope.$watch('selectedIndex', function (current, old) {
      Utils.selectedIndex = current;
    });
    $scope.gatlingDetails = $stateParams.tag === 'Gatling' ? true : false;
    /* Get deeplink zoom params from query string */
    if ($state.params.zoomFrom)
      TestRuns.zoomFrom = $state.params.zoomFrom;
    if ($state.params.zoomUntil)
      TestRuns.zoomUntil = $state.params.zoomUntil;

    /* Get selected series params from query string */
    if ($state.params.selectedSeries)
      TestRuns.selectedSeries = decodeURIComponent($state.params.selectedSeries);

    $scope.value = $stateParams.tag;
    /* reset zoom*/
    $scope.resetZoom = function () {
      /*reset zoom*/
      TestRuns.zoomFrom = '';
      TestRuns.zoomUntil = '';
      $state.go($state.current, {}, { reload: true });
    };
    /* Zoom lock enabled by default */
    $scope.zoomLock = true;
    $scope.init = function () {
      /* use local time in graphs */
      Highcharts.setOptions({ global: { useUTC: false } });
      Dashboards.get($stateParams.productName, $stateParams.dashboardName).then(function (dashboard) {
        $scope.dashboard = Dashboards.selected;
        $scope.metrics = addAccordionState(Dashboards.selected.metrics);
        /* Get tags used in metrics */
        $scope.tags = Tags.setTags($scope.metrics, $stateParams.productName, $stateParams.dashboardName, $stateParams.testRunId, Dashboards.selected.tags);
        /* if reloading a non-existing tag is in $statParams */
        $scope.value = checkIfTagExists($stateParams.tag) ? $stateParams.tag : 'All';
        /* set the tab index */
        $scope.selectedIndex = Tags.getTagIndex($scope.value, $scope.tags);
        if ($stateParams.testRunId) {
          TestRuns.getTestRunById($stateParams.productName, $stateParams.dashboardName, $stateParams.testRunId).success(function (testRun) {
            TestRuns.selected = testRun;
          });
        }
      });
    };
    function checkIfTagExists(tag) {
      var exists = false;
      _.each($scope.tags, function (existingTag) {
        if (tag === existingTag.text) {
          exists = true;
          return;
        }
      });
      return exists;
    }
    function addAccordionState(metrics) {
      _.each(metrics, function (metric) {
        metric.isOpen = false;
      });
      return metrics;
    }
    /* default zoom range for live graphs is -10m */
    $scope.zoomRange = TestRuns.zoomRange !== '' ? TestRuns.zoomRange : '-10min';
    /* Set active tab */
    $scope.isActive = function (tag) {
      return $scope.value === tag;
    };
    $scope.editMetric = function (metricId) {
      $state.go('editMetric', {
        productName: $stateParams.productName,
        dashboardName: $stateParams.dashboardName,
        metricId: metricId
      });
    };
    $scope.loadTags = function (query) {
      var matchedTags = [];
      _.each(Dashboards.selected.tags, function (tag) {
        if (tag.text.toLowerCase().match(query.toLowerCase()))
          matchedTags.push(tag);
      });
      return matchedTags;
    };
    function updateFilterTags(filterTags, filterOperator, persistTag, callback) {
      var combinedTag;
      var newTags = [];
      _.each(filterTags, function (filterTag, index) {
        switch (index) {
        case 0:
          combinedTag = filterTag.text + filterOperator;
          break;
        case filterTags.length - 1:
          combinedTag += filterTag.text;
          break;
        default:
          combinedTag += filterTag.text + filterOperator;
        }
      });
      newTags.push({ text: combinedTag });
      Dashboards.updateTags($stateParams.productName, $stateParams.dashboardName, newTags, function (tagsUpdated) {
        /* if persist tag is checked and tags are updated, update dashboard tags*/
        if (tagsUpdated && persistTag) {
          Dashboards.update().success(function (dashboard) {
            $scope.dashboard = Dashboards.selected;
            /* Get tags used in metrics */
            //$scope.tags = Tags.setTags(Dashboards.selected.metrics, $stateParams.productName, $stateParams.dashboardName, $stateParams.testRunId, Dashboards.selected.tags);
            callback(newTags);
          });
        } else {
          callback(newTags);
        }
      });
    }
    $scope.removeTag = function (removeTag) {
      var updatedTags = [];
      _.each(Dashboards.selected.tags, function (tag) {
        if (tag !== removeTag)
          updatedTags.push({ text: tag.text });
      });
      Dashboards.selected.tags = updatedTags;
      Dashboards.update().success(function (dashboard) {
      });
    };
    $scope.openTagsFilterModal = function (size) {
      var modalInstance = $modal.open({
        templateUrl: 'tagFilterModal.html',
        controller: 'TagFilterModalInstanceController',
        size: size
      });
      modalInstance.result.then(function (data) {
        updateFilterTags(data.filterTags, data.filterOperator, data.persistTag, function (newTag) {
          /* Get tags used in metrics */
          $scope.tags = Tags.setTags(Dashboards.selected.metrics, $stateParams.productName, $stateParams.dashboardName, $stateParams.testRunId, Dashboards.selected.tags);
          $scope.value = newTag[0].text;
          /* set tab index */
          setTimeout(function () {
            $scope.$apply(function () {
              $scope.selectedIndex = Tags.getTagIndex($scope.value, $scope.tags);
            });
          }, 1000);
        });
      }, function () {
        $log.info('Modal dismissed at: ' + new Date());
      });
    };
  }
]);
