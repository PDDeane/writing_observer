/* 
   Page script. This is injected into each web page on associated web sites.
*/ 

/* For debugging purposes: we know the extension is active */
document.body.style.border = "5px solid blue";

function log_error(error_string) {
    /* 
       We should send errors to the server, but for now, we
       log to the console.
    */
    console.trace(error_string);
}

function doc_id() {
    /*
      Extract the Google document ID from the window
    */
    try {
	return googledocs_id_from_url(window.location.href);
    } catch(error) {
	log_error("Couldn't read document id");
	return null;
    }
}


function this_is_a_google_doc() {
    /*
      Returns 'true' if we are in a Google Doc
    */
    return window.location.href.search("://docs.google.com/") != -1;
}

function log_event(event_type, event) {
    /*
      We pass an event, annotated with the page document ID and title,
      to the background script
    */
    event["title"] = google_docs_title();
    event["doc_id"] = doc_id();
    event['event'] = event_type;
    console.log(event);
    chrome.runtime.sendMessage(event);
}

// Data structure specifying the events we want to capture from the browser.
EVENT_LIST = {
    "keystroke": {
	"events": [
	    "keypress", "keydown", "keyup"
	],
	"properties": [
	    'altKey', 'buttons', 'charCode', 'code', 'ctrlKey', 'isComposing', 'key', 'keyCode',
	    'location', 'metaKey', 'repeat', 'shiftKey', 'which', 'isTrusted', 'target', 'timeStamp', 'type'],
	"target": "document"
    },
    "mouseclick": {
	"events": [
	    "mouseclick", "mousedown", "mouseup"
	],
	"properties": [
	    "button", "buttons",
	    "clientX", "clientY",
	    "layerX", "layerY",
	    "offsetX", "offsetY",
	    "screenX", "screenY",
	    "movementX", "movementY",
	    'altKey', 'ctrlKey',
	    'metaKey', 'shiftKey', 
	    'which', 'isTrusted',
	    'timeStamp', 'type',
            // We capture target and parent target info because it gives us
            // a snapshot of what exactly got clicked on
	    'target.id', 'target.className',
	    'target.innerText', 'target.nodeType','target.localName',
	    'target.parentNode.id', 'target.parentNode.className',
	    'target.parentNode.nodeType', 'target.parentNode.localName'
	],
	"target": "document"
    },
    "attention": {
       "events": ["focusin", "focusout"],
	// Not all of these are required for all events...
	"properties": ['bubbles', 'cancelable', 
	'isTrusted', 'timeStamp', 'type',
	// We capture related target, target and parent target info 
	// because it gives us a snapshot of what exactly got or lost focus
	'relatedTarget.className', 'relatedTarget.id',
	'target.className', 'target.id', 'target.innertext', 
	'target.nodeType', 'target.localName',
	'target.parentNode.className', 'target.parentNode.id', 'target.parentNode.innerText', 'target.parentNode.nodeType', 'target.parentNode.localName'
	],
	"target": "window"
    },
    "visibility": {
        "events": ["visibilitychange"],
        "properties": ['target', 'bubbles', 'cancelable', 'isTrusted', 'timeStamp', 'type'],
        "target": "document"
    },
    "save": {
        "events": ["google_docs_save"],
        "properties": [
             "doc_id", "bundles", 
             "event", "timestamp"
        ],      
        "target": "window"
    },
    "load": {
        "events": ["document_loaded"],
        "properties": [
              "doc_id", "event",
              "history", "title",
              "timestamp"
        ],
        "target": "window"
    },
    "readystate": {
        "events": ["readystatechange"],
        "properties": [
              "doc_id", "event",
              "target", "timestamp", "type"
        ],
        "target": "window"
    },
    "pageshow": {
        "events": ["pageshow"],
        "properties": ['target', 'bubbles', 'cancelable', 'isTrusted', 'timeStamp', 'type'],
        "target": "window"
    }
};

function generic_eventlistener(event_type, frameindex, event) {
    /*
       This function calls eventlistener_prototype on setup, then
       calls addStreamViewListeners, which have to be added dynamically
       after content loads.
    */


    /*
       This function captures any events specified in EVENT_LIST and passes them to the server.
    */
    return function(event) {
        /*
          Listen for events, and pass them back to the background page.
        */
        var event_data = {};
        event_data["event_type"] = event_type;
        properties = EVENT_LIST[event_type].properties;
        var keystroke_data = {};
        for (var property in properties) {
            const prop = treeget(event, properties[property]);
            if(prop !== null) {
                keystroke_data[properties[property]] = treeget(event, properties[property]);
            }
        }
        if (frameindex===undefined) {
            frameindex='0';
        }
        
        // uncomment this to see all events and the frame they occurred in
        //console.log(frameindex, event);
        
        event_data[event_type] = keystroke_data;
        event_data['frameindex']=frameindex;
        log_event(event_type, event_data); 

 	// When focus changes, update event listeners on docos_stream_view,
 	// which is a dynamically updated display of comments and replies.
 	// The dynamic updates means our initial set of listeners doesn't
 	// always catch events that happen in this div. Specifically, if
 	// the user clicks on the 'Comments' button, or if they click on
 	// certain fields in displayed comments, events don't get registered
 	// without the extra step called by addStreamViewListers().
 	
 	// TODO: figure out way to limit the number of times addStreamViewListeners
 	// is called. We don't really want to call it every time focus shifts.
 	if (event_type=='attention') {
            addStreamViewListeners();
        }        
    }
}

function handleEvent(event, event_type, frameindex) {
        /*
          This function does basically the same thing as the generic eventlistener.
          function. But I have to be able to define constant events so that I can 
          remove them (so as not to have reduplicated event handlers for the same 
          event), so I need to define the function outside of the anonymous context.
        */
	var event_data = {};
	event_data["event_type"] = event_type;
	properties = EVENT_LIST[event_type].properties;
	var keystroke_data = {};
	for (var property in properties) {
	    const prop = treeget(event, properties[property]);
	    if(prop !== null) {
		keystroke_data[properties[property]] = treeget(event, properties[property]);
	    }
	}
        event_data[event_type] = keystroke_data;
        event_data['frameindex']=99;
        log_event(event_type, event_data); 
}

function clickHandler(event) {
        //Named function so we can specifically remove it.
        handleEvent(event,'mouseclick',99);
    }

function keystrokeHandler(event) {
        // Named function so we can specifically remove it.
        handleEvent(event,'keystroke',99);
    }

function addStreamViewListeners() {
        el = document.getElementById('docos-stream-view');
        if (el) {
            //remove any clickhandlers or keystrokehandlers that have
            //already been attached to docos-stream-view.
            el.removeEventListener('mousedown',clickHandler);
            el.removeEventListener('mouseup',clickHandler);
            el.removeEventListener('mouseclick',clickHandler);
            el.removeEventListener('keydown',keystrokeHandler,true);
            el.removeEventListener('keyup',keystrokeHandler,true);
            el.removeEventListener('keypress',keystrokeHandler,true);

            //Now add them afresh, to make sure that dynamically
            //added content will generate events ...
            el.addEventListener('mousedown',clickHandler);
            el.addEventListener('mouseup',clickHandler);
            el.addEventListener('mouseclick',clickHandler);
            el.addEventListener('keydown',keystrokeHandler,true);
            el.addEventListener('keyup',keystrokeHandler,true);
            el.addEventListener('keypress',keystrokeHandler,true);
        }       
}


var editor = document.querySelector('.kix-appview-editor');

// The following code is designed to observe changes in the document,
// not just html events. (Right now we're not observing CSS changes 
// such as setting an element to display: none. Some of those matter
// for Google Docs, for instance, when a comment is "resolved", it 
// is merely hidden.)

var mutationsObserved = {

// mutationsObserved is the data structure where we store information 
// about which events to log how. This functions as a rule base that 
// governs what changes in the html document are logged and sent back
// to the server. This code is based on the  MutationObserver and 
// mutationRecord classes. See:
//  
// https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver 
// https://developer.mozilla.org/en-US/docs/Web/API/MutationRecord 
// 
// Current format works like this:
//  "insert": {
//    ^^^       
//  Category.  
//  A term we   
//  made up.    
//  It describes
// the type of  
//  change made  
//  by the      
//  mutationRecord.
//
//
//    “doc-os-view”:       [“foo”,          “bar”,          “bif”] 
//        ^^^                 ^               ^               ^ 
//  Class of (first)     Class of the    Type label in    Class of the parent 
//  added node for       target node     our event sent   node whose inner  
//  "insert", of the     for inserts or  to the Writing   text we want to  
//  (first) removed      deletes. Null   Observer server  monitor. The innerText 
//  node for "delete",   otherwise.                         will be sent to the 
//  or class of the                                         WO server. 
//  target node for all
//  other categories.

        "insert": {
             "docos-docoview-resolve-button-visible": ["docos-stream-view", "add-comment","kix-discussion-plugin"],
             "docos-replyview-comment": ["docos-anchoreddocoview-content","add-reply","kix-discussion-plugin"],
             "kix-spell-bubble": ["kix-appview-editor","view-spelling-suggestion",'']
        },
        "delete": {
            "docos-replyview-suggest": ["docos-docoview-rootreply", "resolve-suggestion","kix-discussion-plugin"],
            "docos-replyview-first": ["docos-docoview-rootreply", "delete-comment","kix-discussion-plugin"],        
            "docos-replyview-comment": ["docos-docoview-replycontainer", "delete-reply","kix-discussion-plugin"]
        },
        "input": {
            "docos-input-textarea": [null, "type-input",''],
        },
        "clear": {
            "docos-input-textarea": [null, "clear-input",''],       
        },
        "replace": {
            "docos-replyview-static": [null, "edit-comment","kix-discussion-plugin"]
        },       
        "suggest": {
            "docos-replyview-static": [null, "add-suggestion","kix-discussion-plugin"]
        },
        "other": {
             "kix-spell-bubble": [null,"view-spelling-suggestion",'']
        }
    } 

function classifyModification(mutation) {
    /*
      Determine what kind of change is being made. We will use this information
      to assign the "category" that we use as the key to access the correct list
      of rule patterns from the mutationsObserved variable.
    */
    if (mutation.addedNodes.length > 0 && mutation.removedNodes.length == 0) {
        return "insert";
    }            
    else if (mutation.addedNodes.length == 0 && mutation.removedNodes.length > 0) {
         if (mutation.removedNodes[0].nodeType == Node.TEXT_NODE) {
             return "clear";
         }
         else {
           return "delete";
         }
    }
    else if (mutation.addedNodes.length > 0 && mutation.removedNodes.length > 0 &&
            mutation.removedNodes[0].nodeType == Node.TEXT_NODE &&
            mutation.addedNodes[0].nodeType == Node.TEXT_NODE
    ) {
         return "replace";
    }
    else if (mutation.type=='characterData') {
        return "input";
    } 
    else if (mutation.addedNodes.length > 0 && mutation.removedNodes.length > 0 ) {
        return "suggest";
    }
    else {
        return "other";
    }
}

function stringCheck(myVar) {
    /*
      Utility function to check whether a variable is a string.
      We need that because some classes in Google docs graphics are not strings.
    */
    if (typeof myVar === 'string' || myVar instanceof String) {
        return true;
    } else {
        return false;
    }
}

function findAncestor (el, cls) {
    while ((el = el.parentNode) && el.className.indexOf(cls) < 0);
    return el;
}

function prepareMutationObserver(mutationsObserved) {
    /*
      Set up a MutationObserver that will use the mutationObserved dictionary
      to tell it which changes to log and what label to log it as.
    */
    var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {

          event = {}
          event['event_type'] = 'mutation';

          // This list guarantees that we'll have the information we need 
          // to understand what happened in a change event.
  	  properties = [
  	      'addedNodes.length', 'addedNodes[0].className',
  	      'addedNodes[0].data', 'addedNodes[0].id', 
  	      'addedNodes[0].innerText', 'addedNodes[0].nodeType',
  	      'removedNodes.length', 'removedNodes[0].className', 
  	      'removedNodes[0].data', 'removedNodes[0].id', 
  	      'removedNodes[0].innerText', 'removedNodes[0].nodeType', 
  	      'target.className', 'target.data',
  	      'target.innertext', 'target.parentNode.id', 
  	      'target.parentNode.className','type'
          ];
          
          // Populate the mutation_data subdictionary that we use to
          // pass the details of the mutation back to the WO sever.
	  var mutation_data = {};
	  for (var property in properties) {
	      const prop = treeget(mutation, properties[property]);
	      if (prop !== null) {
		  mutation_data[properties[property]] = 
		      treeget(mutation, properties[property]);
	      }
	  }
          event['change'] = mutation_data;

          // uncomment this to observe all mutations in the console log.
          //console.log(mutation);

          // apply the rule engine defined by mutationsObserved to record
          // watched events.

          // First, check what kind of event this is
          category = classifyModification(mutation);
          
          // Then record that category as an event_type
          event['event_type']=category;
          
          // Filter the templates to those that are relevant to this category
          actions = mutationsObserved[category];
          
          // Then loop through the available templates
          for (var targetClass in actions) {
          
              // TODO: We do the same basic thing in each of the branches below, 
              // but we need to make sure we only trigger these actions in ONE 
              // of the branches. There's probably a more succinct way to code 
              // this but I haven't figured it out yet.

              // Branch for the insert category
              //
              if (category=='insert') {
                     // Apply the event label based on the rule
                     if (stringCheck(event.change['addedNodes[0].className']) 
                        && event.change['addedNodes[0].className'].indexOf(targetClass)>=0
                        && event.change['target.className'].indexOf(actions[targetClass][0])>=0
                     ) {
                        // Google Docs inserts comments during the document load. 
                        // We need to flag that status.
                        if (loading) { 
                            event['type'] = "loading_" + actions[targetClass][1];
                        //Otherwise use the normal label for this event
                        } else { 
                            event['type'] = actions[targetClass][1];
                        }
                        //If we specify a window we want to watch, get the innerText
                        if (actions[targetClass][2]!='' 
                           && findAncestor(mutation.target,actions[targetClass][2])) { 
                            event['context_content'] = 
                                findAncestor(mutation.target,actions[targetClass][2]).innerText;
                        }
                        // Then send the logged event to the WO server.
                        log_event(mutation.type,event);
                        break;
                     } 
              }

              //Branch for the delete category
              //
              else if (category=='delete') {
                 if (stringCheck(event.change['removedNodes[0].className']) 
                    && event.change['removedNodes[0].className'].indexOf(targetClass)>=0
                    && event.change['target.className'].indexOf(actions[targetClass][0])>=0
                 ) {
                       event['type'] = actions[targetClass][1];
                       if (actions[targetClass][2]!='' 
                           && findAncestor(mutation.target,actions[targetClass][2])) {
                            event['context_content'] = 
                                findAncestor(mutation.target,actions[targetClass][2]).innerText;
                       }
                       log_event(mutation.type,event);
                       break;
                 } 
             }

             //Branch for the all other categories
             //
             else if (stringCheck(event.change['target.parentNode.className'])
                     && event.change['target.parentNode.className'].indexOf(targetClass)>=0
                 ) {
                       event['type'] = actions[targetClass][1];
                       if (actions[targetClass][2]!='' 
                          && findAncestor(mutation.target,actions[targetClass][2])) {
                             event['context_content'] = 
                                 findAncestor(mutation.target,actions[targetClass][2]).innerText;
                       }
                       log_event(mutation.type,event);
                       break;
                   }
              }
        });
    });
    return observer;
}

// Set mutation observer options
var options = {

    // We don't want to watch attribute changes
    attributes: false,
    
    // but we do want to watch tree and character changes.
    childList: true,
    characterData: true,
    subtree: true  
};

// OK, now create the MutationObserver and start running it
// on the document.
observer = prepareMutationObserver(mutationsObserved)
observer.observe(editor, options);

// Now initialize the generic event listener. We will listen to
// events in all iFrames, as well as  the main content document.
var frames = Array.from(document.getElementsByTagName("iframe"));

// TODO: We should really make a list of documents instead of a fake iframe....
frames.push({'contentDocument': document})

var s = document.createElement('script');
s.src = chrome.runtime.getURL('pageinfo.js');

// Add an event listener to each iframe in the iframes under frames.
for (var event_type in EVENT_LIST) {

    for (var event_idx in EVENT_LIST[event_type]['events']) {
	js_event = EVENT_LIST[event_type]['events'][event_idx];
	target = EVENT_LIST[event_type]['target']
	if(target === 'document') {
 
            var numFrames = 0;
	    for(var iframe in frames) {
		if(frames[iframe].contentDocument) {
                    console.log(iframe,frames[iframe].contentDocument)
                    frames[iframe].contentDocument.addEventListener(js_event, generic_eventlistener(event_type,iframe));
                    numFrames = iframe;
              }               
	    }	    
	} else if (target === 'window') {
            window.addEventListener(js_event, generic_eventlistener(event_type));
	}
    }
}

// NOTE: gmail listening is currently disabled.
function gmail_text() {
    /*
      This function returns all the editable text in the current gmail
      window. Note that in a threaded discussion, it's possible to
      have several open on the same page.

      This is brittle; Google may change implementation and this will
      break.

      We will probably disable gmail analytics in the pilot.
    */
    var documents = document.getElementsByClassName("editable");
    for(document in documents) {
	documents[document] = {
	    'text': documents[document].innerHTML
	};
    }
    return documents;
}

function google_docs_title() {
    /*
      Return the title of a Google Docs document.

      Note this is not guaranteed 100% reliable since Google
      may change the page structure.
    */
    try {
	return document.getElementsByClassName("docs-title-input")[0].value;
    } catch(error) {
	log_error("Couldn't read document title");
	return null;
    }
}

function google_docs_partial_text() {
    /*
      Return the *loaded* text of a Google Doc. Note that for long
      documents, this may not be the *complete* text since off-screen
      pages may be lazy-loaded. The text omits formatting, which is
      helpful for many types of analysis

      We want this for redundancy: we'd like to confirm we're correctly
      reconstructing text.
    */
    try {
	return document.getElementsByClassName("kix-page")[0].innerText;
    } catch(error) {
	log_error("Could get document text");
	return null;
    }
}

function google_docs_partial_html() {
    /*
      Return the *loaded* HTML of a Google Doc. Note that for long
      documents, this may not be the *complete* HTML, since off-screen
      pages may be lazy-loaded. This includes HTML formatting, which
      may be helpful, but is incredibly messy.
      
      I hate Google's HTML. What's wrong with simple, clean, semantic
      <b> tags and classes? Why do we need something like this instead:

      <span class="kix-wordhtmlgenerator-word-node" 
      style="font-size:14.666666666666666px;font-family:Arial;color:#000000;
      background-color:transparent;font-weight:700;font-style:normal;
      font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;">

      Seriously, Google?

      And yes, if you download documents from Google, it's a mess like
      this too.
     */
    return document.getElementsByClassName("kix-page")[0].innerHTML;
}

function executeOnPageSpace(code){
    /* This is from 
       https://stackoverflow.com/questions/9602022/chrome-extension-retrieving-global-variable-from-webpage

       It is used to run code outside of the extension isolation box,
       for example to access page JavaScript variables.
     */
     
    // create a script tag
    var script = document.createElement('script')
    script.id = 'tmpScript'

    // place the code inside the script. later replace it with execution result.
    script.textContent = 
	'document.getElementById("tmpScript").textContent = JSON.stringify(' + code + ')'

    // attach the script to page
    document.documentElement.appendChild(script)

    // collect execution results
    let result = document.getElementById("tmpScript").textContent

    // remove script from page
    script.remove()
    return JSON.parse(result)
}

function google_docs_version_history() {
    /*
      Grab the _complete_ version history of a Google Doc. We do this
      on page load. Note that this may lead to a lot of data. But this
      lets us do most of our analytics on documents created or edited
      without our extension.

      Note that if Google changes their implementation, this may
      break. We don't want to promise to users this will always
      work. But it's good to have for the pilot.

      It also lets us debug the system.
    */
    var token = executeOnPageSpace("_docs_flag_initialData.info_params.token");

    metainfo_url = "https://docs.google.com/document/d/"+doc_id()+"/revisions/tiles?id="+doc_id()+"&start=1&showDetailedRevisions=false&filterNamed=false&token="+token+"&includes_info_params=true"

    fetch(metainfo_url).then(function(response) {
	response.text().then(function(text) {
	    tiles = JSON.parse(text.substring(5)); // Google adds a header to prevent JavaScript injection. This removes it.
	    var first_revision = tiles.firstRev;
	    var last_revision = tiles.tileInfo[tiles.tileInfo.length - 1].end;
	    version_history_url = "https://docs.google.com/document/d/"+doc_id()+"/revisions/load?id="+doc_id()+"&start="+first_revision+"&end="+last_revision;
	    fetch(version_history_url).then(function(history_response) {
		history_response.text().then(function(history_text) {
		    log_event(
			"document_history",
			{'history': JSON.parse(history_text.substring(4))}
		    );
		});
	    });
	});
    });
}

// When the script is loaded, we assume the page is still being loaded
var loading = 1;

function writing_onload() {
    if(this_is_a_google_doc()) {
	log_event("document_loaded", {
	    "partial_text": google_docs_partial_text()
	})
        google_docs_version_history();
    }
    // So once we hit a load event, we can assume we're not loading any more.
    loading = 0;
}

window.addEventListener("load", writing_onload); 

