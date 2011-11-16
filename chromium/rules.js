function Rule(from, to) {
  this.from = from;
  this.to = to;
  this.from_c = new RegExp(from);
}

function Exclusion(pattern) {
  this.pattern = pattern;
  this.pattern_c = new RegExp(pattern);
}

function CookieRule(host, cookiename) {
  this.host = host
  this.host_c = new RegExp(host);
  this.name = cookiename;
  this.name_c = new RegExp(cookiename);
}

// XXX: on_by_default
function RuleSet(set_name, match_rule) {
  this.name = set_name;
  if (match_rule)
    this.ruleset_match_c = new RegExp(match_rule);
  else
    this.ruleset_match_c = null;
  this.rules = [];
  this.exclusions = [];
  this.targets = [];
  this.cookierules = [];
  this.active = true; // XXX: prefs?
}

RuleSet.prototype = {
  _apply: function(urispec) {
    var returl = null;
    // If a rulset has a match_rule and it fails, go no further
    if (this.ruleset_match_c && !this.ruleset_match_c.test(urispec)) {
      log(VERB, "ruleset_match_c excluded " + urispec);
      return null;
    }
    // Even so, if we're covered by an exclusion, go home
    for(i = 0; i < this.exclusions.length; ++i) {
      if (this.exclusions[i].pattern_c.test(urispec)) {
        log(DBUG,"excluded uri " + urispec);
        return null;
      }
    }
    // Okay, now find the first rule that triggers
    for(i = 0; i < this.rules.length; ++i) {
      returl = urispec.replace(this.rules[i].from_c,
                               this.rules[i].to);
      if (returl != urispec) {
        return returl;
      }
    }
    if (this.ruleset_match_c) {
      // This is not an error, because we do not insist the matchrule
      // precisely describes to target space of URLs ot redirected
      log(DBUG,"Ruleset "+this.name
              +" had an applicable match-rule but no matching rules");
    }
    return null;
  },

};


function RuleSets() {
  // Load rules into structure
  this.targets = {};

  for(var i = 0; i < rule_list.length; i++) {
    var xhr = new XMLHttpRequest();
    // Use blocking XHR to ensure everything is loaded by the time
    // we return.
    //var that = this;
    //xhr.onreadystatechange = function() { that.loadRuleSet(xhr); }
    xhr.open("GET", chrome.extension.getURL(rule_list[i]), false);
    //xhr.open("GET", chrome.extension.getURL(rule_list[i]), true);
    xhr.send(null);
    this.loadRuleSet(xhr);
  }
  this.global_rulesets = this.targets["*"] ? this.targets["*"] : [];
}

RuleSets.prototype = {
  loadRuleSet: function(xhr) {
    // Get file contents
    if (xhr.readyState == 4) {
      // XXX: Validation + error checking
      var ruletag = xhr.responseXML.getElementsByTagName('ruleset')[0];
      
      if (ruletag.attributes.default_off) { return; }

      var rule_set = new RuleSet(ruletag.getAttribute('name'),
                                 ruletag.getAttribute('match_rule'));

      var rules = xhr.responseXML.getElementsByTagName('rule');
      for(var j = 0; j < rules.length; j++) {
        rule_set.rules.push(new Rule(rules[j].getAttribute('from'),
                                      rules[j].getAttribute('to')));
      }

      var exclusions = xhr.responseXML.getElementsByTagName('exclusions');
      for(var j = 0; j < exclusions.length; j++) {
        rule_set.exclusions.push(
              new Exclusion(exclusions[j].getAttribute('pattern')));
      }

      var cookierules = xhr.responseXML.getElementsByTagName('securecookie');
      for(var j = 0; j < cookierules.length; j++) {
        rule_set.cookierules.push(new CookieRule(cookierules[j].getAttribute('host'),
                                             cookierules[j].getAttribute('name')));
      }

      var targets = xhr.responseXML.getElementsByTagName('target');
      for(var j = 0; j < targets.length; j++) {
         var host = targets[j].getAttribute('host');
         if (!(host in this.targets)) {
           this.targets[host] = [];
         }
         this.targets[host].push(rule_set);
      }
    }
  },

  applicableRulesets: function(host) {
    // Return a list of rulesets that apply to this host
    var i, tmp, t;
    var results = this.global_rulesets;
    if (this.targets[host])
      results = results.concat(this.targets[host]);
    // replace each portion of the domain with a * in turn
    var segmented = host.split(".");
    for (i = 0; i < segmented.length; ++i) {
      tmp = segmented[i];
      segmented[i] = "*";
      t = segmented.join(".");
      segmented[i] = tmp;
      if (this.targets[t])
        results = results.concat(this.targets[t]);
    }
    // now eat away from the left, with *, so that for x.y.z.google.com we
    // check *.z.google.com and *.google.com (we did *.y.z.google.com above)
    for (i = 1; i < segmented.length - 2; ++i) {
      t = "*." + segmented.slice(i,segmented.length).join(".");
      if (this.targets[t])
        results = results.concat(this.targets[t]);
    }
    log(DBUG,"Applicable rules for " + host + ":");
    for (i = 0; i < results.length; ++i)
      log(DBUG, "  " + results[i].name);
    return results;
  },

  shouldSecureCookie: function(cookie) {
    // Check to see if the Cookie object c meets any of our cookierule citeria
    // for being marked as secure
    //log(DBUG, "Testing cookie:");
    //log(DBUG, "  name: " + cookie.name);
    //log(DBUG, "  host: " + cookie.host);
    //log(DBUG, "  domain: " + cookie.domain);
    //log(DBUG, "  rawhost: " + cookie.rawHost);
    var i,j;
    var rs = this.applicableRulesets(cookie.domain);
    for (i = 0; i < rs.length; ++i) {
      var ruleset = rs[i];
      if (ruleset.active)
        for (j = 0; j < ruleset.cookierules.length; j++) {
          var cr = ruleset.cookierules[j];
          if (cr.host_c.test(cookie.domain) && cr.name_c.test(cookie.name))
            return true;
        }
    }
    return false;
  },

  rewriteURI: function(urispec, host) {
    var i = 0;
    var newuri = null
    var rs = this.applicableRulesets(host);
    for(i = 0; i < rs.length; ++i) {
      if ((newuri = rs[i]._apply(urispec)))
        return newuri;
    }
    return null;
  },
};

