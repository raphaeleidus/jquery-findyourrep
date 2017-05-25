/* jQuery.findYourRep
 * ==================
 *
 * A jQuery plugin to render a find-your-reps form into a target HTML element.
 * Built by Dan Drinkard using Sunlight Foundation APIs.
 *
 * Copyright 2014 Sunlight Foundation. BSD3 License.
 *
 * Usage:
 * ------
 *
 * Create an HTML element to use as a target, and call findYourRep(options) on it.
 * This example shows the default options. The only required option is
 * A Sunlight API Key.
 *
 * ```javascript
 * $('.mytarget').findYourRep({
 *   apikey: 'YourSunlightApiKey',
 *   apis: 'congress, openstates',
 *   title: 'The Title of your Widget',
 *   text: 'Enter your address to see who represents you.',
 *   action: 'Go!'
 * });
 * ```
 */
;(function(window){

window.FYR || (window.FYR = {});
window.FYR.bootstrap = function($, window, undefined){
  $.findYourRep = {};
  $.findYourRep._version = '0.0.3';
  $.findYourRep.sunlightApiKey = null;
  $.findYourRep.defaultGeocoder = 'google';
  $.findYourRep.geocodeWithSSL = !(location.protocol === 'http:' &&
                                  window.XDomainRequest &&
                                  !('withCredentials' in new XMLHttpRequest()));
  $.findYourRep.geocoderApiKey = null;
  $.findYourRep.templateContext = {
    title: 'Find Your Representatives',
    apis: 'congress, openstates',
    text: 'Enter your address to see who represents you.',
    action: 'Go!'
  };

  // brokers a single api call, as a completely premature optimization.
  $.findYourRep.apiCall = function(url, params) {
    return $.getJSON(url, params);
  };

  // takes either a string address or latlng object and
  // returns a promise for either.
  $.findYourRep.geocodeOrResolveImmediately = function(arg) {
    var gcreq;
    if (typeof arg == 'object') {
      gcreq = $.Deferred().resolve(arg);
    } else {
      gcreq = $.findYourRep.geocode(arg);
    }
    return gcreq;
  };

  // performs super-basic template rendering via regexp replace. No nested object support.
  $.findYourRep.render = function(template, ctx) {
    return template.replace(/\{\{ ?([\w\d_]+) ?\}\}/gi, function(tag, match) {
      return ctx[match] || '';
    });
  };

  // geocodes an address, returning a latlng object.
  $.findYourRep.geocode = function (address, geocoder) {
    var gc,
        dfd = new $.Deferred(),
        params = {
          provider: geocoder || $.findYourRep.defaultGeocoder,
          useSSL: $.findYourRep.geocodeWithSSl,
        };

    if ($.findYourRep.geocoderApiKey) {
      params.apiKey = $.findYourRep.geocoderApiKey;
    }
    gc = new GeocoderJS.createGeocoder(params);
    gc.geocode(address, function(geocoded){
      try {
        dfd.resolve(geocoded[0]);
      } catch(e) {
        dfd.resolve({});
      }
    });
    return dfd;
  };

  // makes a call to the Sunlight open:states api and returns a result set.
  $.findYourRep.openstates = function(address) {
    var dfd = new $.Deferred(),
        url = "http://openstates.org/api/v1/legislators/geo?callback=?",
        params = {};
    params.apikey = $.findYourRep.sunlightApiKey;

    // only run if we're viewing over http
    if (window.location.protocol.match(/https/)) {
      dfd.reject("Aborting Open States query--it does not support HTTPS :(\n  Ask for it here! https://sunlight.atlassian.net/browse/OS-26");
    } else {
      $.findYourRep.geocodeOrResolveImmediately(address).done(function(geocoded){
        params.lat = geocoded.latitude;
        params['long'] = geocoded.longitude;
        $.findYourRep.apiCall(url, params).done(function(data){
          dfd.resolve(data);
        });
      });
    }
    return dfd;
  };

  // makes a call to the Sunlight congress api and returns a result set.
  $.findYourRep.congress = function(address) {
    var dfd = new $.Deferred(),
        url = "https://congress.api.sunlightfoundation.com/legislators/locate?callback=?",
        params = {};
    params.apikey = $.findYourRep.sunlightApiKey;

    $.findYourRep.geocodeOrResolveImmediately(address).done(function(geocoded){
      params.latitude = geocoded.latitude;
      params.longitude = geocoded.longitude;
      $.findYourRep.apiCall(url, params).done(function(data){
        dfd.resolve(data);
      });
    });
    return dfd;
  };

  // pre-formats the context to be rendered into legislator templates,
  // accounting for inconsistencies in APIs. Override this to change the
  // result display.
  $.findYourRep.getTemplateContext = function(rep, api) {
    var transforms = {};
    if (api == "congress") {
      transforms = {
        'senate': rep.state_name,
        'house': rep.state + '-' + rep.district,
        'D': 'Democrat',
        'R': 'Republican',
        'I': 'Independent'
      };
      return {
        name: rep['title'] + ' ' + rep.first_name + ' ' + rep.last_name,
        details: transforms[rep.party] + ', ' + transforms[rep.chamber],
        photoUrl: 'http://bioguide.congress.gov/bioguide/photo/'+rep.bioguide_id[0]+'/' + rep.bioguide_id + '.jpg',
        resultUrl: 'http://opencongress.org/people/show/' + rep.govtrack_id
      };
    } else if (api == "openstates") {
      transforms = {
        'upper': 'Upper Chamber',
        'lower': 'Lower Chamber',
        'Democratic': 'Democrat',
        'Republican': 'Republican',
        'Independent': 'Independent'
      };
      return {
        name: rep.full_name,
        details: transforms[rep.party] + ', ' + rep.state.toUpperCase() + '-' + rep.district + ' (' + transforms[rep.chamber] +')',
        photoUrl: rep.photo_url,
        resultUrl: 'http://openstates.org/' + rep.state + '/legislators/' + rep.id
      };
    }
  };

  // The template that is rendered to display the initial form.
  $.findYourRep.formTemplate = "" +
    "<div class='find-your-rep fyr-container' id='fyr{{ idx }}' data-apis='{{ apis }}'>" +
      "<h3>{{ title }}</h3>" +
      "<p>{{ text }}</p>" +
      "<div class='fyr-controls'>" +
        "<textarea placeholder='Enter your address'>{{ defaultValue }}</textarea>" +
        "<button class='fyr-submit'>{{ action }}</button>" +
        "</div>" +
        "<small>Powered by <a href='http://sunlightfoundation.com'>The Sunlight Foundation</a></small>" +
    "</div>";

  // The template that is rendered to display the result container.
  $.findYourRep.resultsTemplate = "" +
  "<div class='fyr-results'>" +
    "<h3>Your Representatives</h3>" +
    "<div class='fyr-congress cf' style='display:none;'>" +
      "<h4>In Congress</h4>" +
      "<ul class='fyr-reps'></ul>" +
    "</div>" +
    "<div class='fyr-openstates cf' style='display:none;'>" +
      "<h4>State Representatives</h4>" +
      "<ul class='fyr-reps'></ul>" +
    "</div>" +
    "<a href='#' class='fyr-back'>&laquo; start over</a>" +
    "<small>Powered by <a href='http://sunlightfoundation.com'>The Sunlight Foundation</a></small>" +
  "</div>";

  // The template that is rendered to display each individual result from any api.
  $.findYourRep.resultTemplate = "" +
  "<li class='fyr-rep cf'>" +
    "<a href='{{ resultUrl }}' target='_top'>" +
    "<img src='{{ photoUrl }}' alt='photo of'>" +
    "<h4>{{ name }}</h4>" +
    "<p class='fyr-details'>{{ details }}</p>" +
    "</a>" +
  "</li>";

  // This is the jQuery plugin itself. Call it as shown at the top of this file.
  $.fn.findYourRep = function(opts){
    var ctx = $.findYourRep.templateContext,
        apis;

    $.findYourRep.sunlightApiKey = opts.apikey || $.findYourRep.sunlightApiKey;
    delete opts.apikey;
    ctx = $.extend({}, ctx, opts);
    apis = ctx.apis.split(/, ?/);

    return $(this).each(function(i, el){
      // bind back button to start over
      $(el).on('click', '.fyr-back', function(evt){
        evt.preventDefault();
        $(el).html($.findYourRep.render($.findYourRep.formTemplate, ctx));
      });
      // bind go button to locate reps
      $(el).on('click', '.fyr-submit', function(evt){
        evt.preventDefault();
        evt.stopPropagation();
        // get the address from the textarea
        var addr = $(el).find('textarea').eq(0).val();
        // render the empty results template
        $(el).find('.fyr-container').eq(0)
             .html($.findYourRep.render($.findYourRep.resultsTemplate, {}));
        // geocode and kick off api calls
        $.findYourRep.geocode(addr).done(function(addrData){
          // with each active api...
          $.each(apis, function(j, api){
            // call the api with the lat/lng object
            $.findYourRep[api](addrData).done(function(repData){
              // result array either lives in root or in root.results
              var iterable = repData.results || repData || [],
                  uppers = ['senate', 'upper'];

              if (iterable.length === 0 || iterable.status == "500") {
                $(el).find('.fyr-' + api).eq(0).show()
                     .find('.fyr-reps').append('<li class="fyr-rep">No results found.</li>').show();
                return false;
              }
              // sort results to list upper house first
              iterable = iterable.sort(function(a, b){
                if (a.chamber == b.chamber) { return 0; }
                else if ($.inArray(a.chamber, uppers) != '-1') { return -1; }
                else { return 1; }
              });
              // iterate over api's results and render a single result template into
              // the results container
              $.each(iterable, function(k, rep){
                $(el).find('.fyr-' + api).eq(0)
                     .show().find('.fyr-reps').eq(0)
                            .append($.findYourRep.render($.findYourRep.resultTemplate,
                                                         $.findYourRep.getTemplateContext(rep, api)));
              });
            }).fail(function(msg){
              window.console && console.log && console.log(msg);
            });
          });
        });
      });
      // render the form to start things off
      $(el).html($.findYourRep.render($.findYourRep.formTemplate, ctx));
    });
  };
};

// new jq has arrived! shift jq off to FYR.$ and re-initialize all the elements we wanted to before...
window.FYR.onNewJq = function(){
  var $;
  window.console && console.log && console.log('Saving new jQuery at FYR.$');
  window.FYR.$ = jQuery.noConflict(true);
  $ = window.FYR.$;
  window.FYR.bootstrap(window.FYR.$, window);
  if (typeof FYR.$els != 'undefined') {
    $.each(FYR.$els, function(i, set) {
      $(set.els).findYourRep(set.opts);
    });
  }
};

// patch jquery if it is too old (<1.7), or missing
var paddedVer = $.map(jQuery.fn.jquery.split('.'), function(num) {
  return ('0' + num).slice(-2);
}).slice(0, 2).join('.');
if (typeof jQuery == 'undefined' || paddedVer < '01.07') {
  window.console && console.log && console.log('Downloading jQuery because it was old or missing...');
  var scr = document.createElement('script');
  scr.src = '//ajax.googleapis.com/ajax/libs/jquery/1.10.2/jquery.min.js';
  scr.onload = FYR.onNewJq;
  document.getElementsByTagName('head')[0].appendChild(scr);

  jQuery.fn.findYourRep = function(opts) {
    window.FYR.$els || (window.FYR.$els = []);
    window.FYR.$els.push({
      els: this,
      opts: opts
    });
    return jQuery(this);
  };
} else {
  FYR.bootstrap(jQuery, window);
}

})(this);
