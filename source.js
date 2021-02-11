[]// tilia Phoenix Switch app
//
// Version: 1.0 (Plan Configurator 6.0)
//
// Tilia Labs Inc.
// Copyright (c) 2015-*, All Rights Reserved

// Default TCP port for connecting to Phoenix Switch Connector
var DefaultPort = "8022";

// Description of XML report action used in Include XML Report outgoing
// connection action and when generating dataset to attach to any output
var XmlReportAction = {
	"name" : "Export XML Report",
	"option" : "IncludeXmlReport",
	"method" : "/export/report/xml",
	"postfix" : null,
	"extension" : "xml",
	"preset" : "ExportXmlReportPreset"
}

// Descriptions of all export actions including on/off property tag name
// and REST API method URL
var ExportActions = [
	{
		"name" : "Save Project",
		"option" : "IncludePhoenixJob",
		"method" : "/save",
		"postfix" : null,
		"extension" : "phx",
		"preset" : null
	},
	{
		"name" : "Export JDF",
		"option" : "IncludeImposedJdf",
		"method" : "/export/jdf",
		"postfix" : null,
		"extension" : "mjd",
		"preset" : "ExportJdfPreset"
	},
	{
		"name" : "Export PDF",
		"option" : "IncludeImposedPdf",
		"method" : "/export/pdf",
		"postfix" : null,
		"extension" : "pdf",
		"preset" : "ExportPdfPreset"
	},
	{
		"name" : "Export PDF Die",
		"option" : "IncludePdfDie",
		"method" : "/export/die/pdf",
		"postfix" : "-die",
		"extension" : "pdf",
		"preset" : "ExportPdfDiePreset"
	},
	{
		"name" : "Export CF2 Die",
		"option" : "IncludeCf2Die",
		"method" : "/export/die/cff2",
		"postfix" : null,
		"extension" : "cf2",
		"preset" : "ExportCf2Preset"
	},
	{
		"name" : "Export DXF Die",
		"option" : "IncludeDxfDie",
		"method" : "/export/die/dxf",
		"postfix" : null,
		"extension" : "dxf",
		"preset" : "ExportDxfPreset"
	},
	{
		"name" : "Export ZCC",
		"option" : "IncludeZcc",
		"method" : "/export/die/zcc",
		"postfix" : null,
		"extension" : "zcc",
		"preset" : "ExportZccPreset"
	},
	{
		"name" : "Export Vector Separation",
		"option" : "IncludeVectorSeparation",
		"method" : "/export/pdf-vector",
		"postfix" : "-vector",
		"extension" : "pdf",
		"preset" : "ExportVectorPreset"
	},
	{
		"name" : "Export Cover Sheet",
		"option" : "IncludeCoverSheet",
		"method" : "/export/cover-sheet",
		"postfix" : "-cover",
		"extension" : "pdf",
		"preset" : "CoverSheetPreset"
	},
	{
		"name" : "Export Tiling Report",
		"option" : "IncludeTilingReport",
		"method" : "/export/tiling-report",
		"postfix" : "-tiling",
		"extension" : "pdf",
		"preset" : "ExportTilingReportPreset"
	},
	{
		"name" : "Export PDF Report",
		"option" : "IncludePdfReport",
		"method" : "/export/report/pdf",
		"postfix" : "-report",
		"extension" : "pdf",
		"preset" : "ExportPdfReportPreset"
	},
	XmlReportAction,
	{
		"name" : "Export JSON Report",
		"option" : "IncludeJsonReport",
		"method" : "/export/report/json",
		"postfix" : null,
		"extension" : "json",
		"preset" : "ExportJsonReportPreset"
	}
]

// Property tag to REST Library get call for all Select from Library props
var LibPropsToMethods = {
	"Presses" : "libraries/presses",
	"ProductStock" : "libraries/stocks",
	"Templates" : "libraries/templates",
	"ProductTemplates" : "libraries/templates",
	"Marks" : "libraries/marks",
	"BackMarks" : "libraries/marks",
	"DieDesignName" : "libraries/diedesigns",
	"CsvImportPreset" : "presets/import/product/csv",
	"ExportJdfPreset" : "presets/export/jdf",
	"ExportPdfPreset" : "presets/export/pdf",
	"ExportPdfDiePreset" : "presets/export/die/pdf",
	"CoverSheetPreset" : "presets/export/cover-sheet",
	"ExportPdfReportPreset" : "presets/export/report/pdf",
	"ExportXmlReportPreset" : "presets/export/report/xml",
	"ExportJsonReportPreset" : "presets/export/report/json",
	"GangingProfile" : "presets/ganging/profiles",
	"CuttingJdfPreset" : "presets/export/jdf-cutting",
	"ExportCf2Preset" : "presets/export/die/cff2",
	"ExportVectorPreset" : "presets/export/pdf-vector",
	"FoldingPatterns": "libraries/folding",
		"FoldingPattern": "libraries/folding"
}

// Per-layout and per-surface export postfix formats used to detect what
// generated layout index a given export file corresponds to
var LayoutPostfixRegex = /^-(\d+)(-(F|B))?\.\w+$/;

// Port number validation regex (is number)
var PortNumberRegex = /\d+/;

// Custom property name value pair regex
var PropNameValueRegex = /([^=\s]+)\s*=\s*(.+)/;

// Global data tag for tracking active jobs being processed to avoid planning
// same jobs more than once when running concurrently
var ActiveJobsTag = "ActiveJobs";

// Main job arrived hook handle either single CSV file or collects
// artwork files as individual Switch "jobs" until a trigger is met
function jobArrived(s : Switch, job : Job) {
	// Make sure incoming job is flagged with timestamp if needed to
	//    1. Set timestamp on when the job arrived in this element
	//    2. Distinguish between jobs that have arrived and not in s.getJobs()
	//       for Switch versions before 13
	var tag = timestampTag(s);
	if (job.getPrivateData(tag).length == 0) {
		var now = new Date();
		job.setPrivateData(tag, now.toString());
	}

	// Run through jobs in both job arrived and timer fired to allow for
	// concurrency in case number of slots alotted to this element > 1
	processJobs(s);
}

// Timer entry point used to check all plan triggers and run plans
function timerFired(s : Switch) {
	// Check timer interval when this element first starts up
	if (s.getTimerInterval() != 20) {
		s.setTimerInterval(20);
	}
	processJobs(s);
}

// Main method responsible for testing for trigger points and running plan on
// trigger ensuring jobs in plan are not pulled into other plans running
// concurrently in same flow element
function processJobs(s : Switch) {
	// See if input mode is direct, if not nothing to do in timer
	var inputMode = s.getPropertyValue("ProductInputMode");

	// Use global state to record jobs that are being worked on so concurrent
	// entry does not cause the same jobto be planned more than once
	var scope = elementScope(s);
	var triggerGroup = null;

	try {
		// Get lock for global state of active jobs
		s.lockGlobalData(scope);

		// Get list of active jobs so we can skip them
		var data = s.getGlobalData(scope, ActiveJobsTag);
		var activeFiles = activeJobsFromData(data);

		// Loop through processed jobs organizing them into plan identifier groups
		var tag = timestampTag(s);
		var groups = pendingJobs(s, activeFiles, tag, inputMode === "Direct");
		if (groups.length == 0) {
			return;
		}

		var first = groups[0];
		if (inputMode !== "Direct") {
			// Simply grab oldest job (CSV or PHX) and start planning
			var firstJob = first.jobs()[0];
			runPlan(s, firstJob, [firstJob], inputMode);
			return;
		}

		// Direct mode, check to see if any trigger conditions have been met
		// starting with N minutes
		var afterMinutes = s.getPropertyValue("PlanNMinutes");
		if (afterMinutes > 0) {
			// Plan groups already sorted oldest first so check oldest job in
			// first plan group
			var now = new Date();
			var elapsed = now.getTime() - first.oldestTime();
			var minutes = elapsed / 60000;
			if (minutes >= afterMinutes) {
				s.log(1, "Planning job after N minutes: " + minutes);
				triggerGroup = first;
			}
		}

		// Next see if N products condition triggered
		if (triggerGroup == null) {
			for (var i = 0; i < groups.length; ++i) {
				var group = groups[i];
				var job = group.oldestJob();
				var nProducts = s.getPropertyValue("PlanNProducts", job);
				if (nProducts > 0 && group.jobs().length >= nProducts) {
					job.log(1, "Planning job on N products: " + group.jobs().length);
					triggerGroup = group;
					break;
				}
			}
		}

		// Next see if custom condition triggered
		if (triggerGroup == null) {
				for (var i = 0; i < groups.length; ++i) {
				var group = groups[i];
				if (group.conditionMet(s, "PlanCondition")) {
					job.log(1, "Planning job on custom condition");
					triggerGroup = group;
					break;
				}
			}
		}

		// If trigger group is present, add group files to list of active jobs
		if (triggerGroup != null) {
			for (var i = 0; i < triggerGroup.jobs().length; ++i) {
				var name = triggerGroup.jobs()[i].getUniqueNamePrefix();
				if (!arrayContains(activeFiles, name)) {
					activeFiles.push(name);
				} else {
					s.log(2, "Duplicate job in active jobs list: " + name);
				}
			}
			// Do not persist across switch restarts
			s.setGlobalData(scope, ActiveJobsTag, activeFiles.join(), false);
		}
	} finally {
		// Make sure global data is unlocked, do not want to keep locked during time
	  // time consuming plan session
		s.unlockGlobalData();
	}

	if (triggerGroup == null) {
		s.log(-1, "Trigger not met yet");
	} else {
		// Trigger met, start planning job
		runPlan(s, triggerGroup.oldestJob(), triggerGroup.jobs(), inputMode);

		// Try to remove newly processed jobs from active jobs list
		try {
			// Lock and get data again since it might have changed
			s.lockGlobalData(scope);
			var current = activeJobsFromData(s.getGlobalData(scope, ActiveJobsTag));
			var updated = [];
			for (var i = 0; i < current.length; ++i) {
				if (!triggerGroup.containsJobWithName(current[i])) {
					updated.push(current[i]);
				}
			}
			s.setGlobalData(scope, ActiveJobsTag, updated.join(), false);
		} finally {
			s.unlockGlobalData();
		}
	}
}

// Organize all arrived jobs into matching plan identifier groups
function pendingJobs(s : Switch, activeJobs : Array, tag : String,
					 direct : Boolean) {

	var groups = [];
	var jobs = s.getJobs();
	if (jobs.length > 0) {
		for (var i = 0; i < jobs.length; ++i) {
			// Restrict only to jobs that have been processed in the jobArrived()
			// hook and are not in the current active jobs list
			var job = jobs.at(i);
			var data = job.getPrivateData(tag);
			if (data.length > 0 &&
				!arrayContains(activeJobs, job.getUniqueNamePrefix())) {

				// Add job to group with same plan ID or create new one
				var planId = direct ? planIdentifer(s, job) : "None";
				var active = null;
				for (var j = 0; j < groups.length; ++j) {
					var group = groups[j];
					if (group.matches(planId)) {
						active = group;
						break;
					}
				}
				if (active == null) {
					active = new PlanGroup(planId);
					groups.push(active);
				}
				active.addJob(job, data);
			}
		}
	}

	// Sort groups oldest first if needed
	if (groups.length > 1) {
		groups.sort(planGroupSorter);
	}

	return groups;
}

// Sorting function for plan groups moves group with oldest job first
function planGroupSorter(g1, g2) {
	return g1.oldestTime() - g2.oldestTime();
}

// Build array of unique job name prefixes from comma-delimited string
function activeJobsFromData(data: String) {
	var activeFiles;
	if (isEmpty(data)) {
		activeFiles = [];
	} else {
		activeFiles = data.split(",");
	}
	return activeFiles;
}

function planIdentifer(s : Switch, job: Job) {
	var id = s.getPropertyValue("PlanIdentifier", job);
	job.log(-1, "Plan identifier for " + job.getNameProper() + ": " + id);
	return id;
}

// Select from Library callback method queries libraries/presets in Phoenix
function getLibraryForProperty(s : Switch, tag : String) {
	var names = [];


	if (tag in LibPropsToMethods) {
		var items = libraryItems(s, LibPropsToMethods[tag]);
		if (items != null) {
			for (var i = 0; i < items.length; ++i) {
				var item = items[i];
				s.log(-1, "Asset: " + item.name);

				// TODO: Stop restricting to product marks when other anchors supported
				if ((tag !== "Marks" && tag !== "BackMarks") ||
					("anchor" in item && item.anchor === "Product")) {
					names.push(item.name);
				}
			}
		}
	} else if (tag === "StockGrade") {
		// For stock grade resolve product stock and get list of all grades in stock
		var stockId = libraryStockId(s);
		var grades = libraryGrades(s, stockId);
		if (grades != null) {
			for (var i = 0; i < grades.length; ++i) {
				names.push(grades[i].name);
			}
		}
	} else if (tag === "SelectedSheets" || tag === "SelectedRolls") {
		// Grab all stocks
		var stocks = libraryItems(s, LibPropsToMethods["ProductStock"]);
		if (stocks != null) {
			// Convert tag name to name of grade item type
			var itemType = tag.mid(8).lower();

			for (var i = 0; i < stocks.length; ++i) {
				var stockName = stocks[i].name;
				var stockId = stocks[i].id;

				// Grab all grades for the given stock
				var grades = libraryGrades(s, stockId);
				if (grades != null) {
					for (var j = 0; j < grades.length; ++j) {
						var gradeName = grades[j].name;

						// Grab all grade items (sheets or rolls) for the given grade
						var method = "libraries/stocks/%1/grades/%2/%3"
							 .arg(stockId).arg(grades[j].id).arg(itemType);

						var gradeItems = libraryItems(s, method);
						if (gradeItems != null) {
							for (var k = 0; k < gradeItems.length; ++k) {
								// Append stock, grade, and sheet/roll names in a/b/c format
								var name = stockName + "/" + gradeName + "/" + gradeItems[k].name;
								names.push(name);
							}
						}
					}
				}
			}
		} else {
			s.log(2, "Could not retrieve any stocks from library");
		}
	} else {
		s.log(3, "Get Library request from unknown property: " + tag);
	}

	return names;
}

function libraryItems(s : Switch, method : String) {
	var http = phoenixConnect(s, method, "application/json", "None");
	var response = get(s, s, http, method);
	var items = null;
	if (response != null) {
		items = eval(response);
	}
	return items;
}

function libraryStockId(s : Switch) {
	var stockId = null;
	var stock = s.getPropertyValue("ProductStock", null);
	if (!isEmpty(stock)) {
		var stocks = libraryItems(s, LibPropsToMethods["ProductStock"]);
		if (stocks != null) {
			for (var i = 0; i < stocks.length; ++i) {
				if (stocks[i].name === stock) {
					stockId = stocks[i].id;
					break;
				}
			}
		}

		if (stockId == null) {
			s.log(2, "Could not find stock ID when getting grades for " + stock);
		}
	} else {
		s.log(2, "Product stock must be set to a constant value to retrieve " +
			  "grades from library");
	}
	return stockId;
}

function libraryGrades(s : Switch, stockId : String) {
	var grade = [];
	if (!isEmpty(stockId)) {
		var method = "libraries/stocks/" + stockId + "/grades";
		return libraryItems(s, method);
	}
}

function isPropertyValid(s : Switch, tag : String, value : String) {
	// Allow empty string port as we will fall back on default value of 8021
	var valid = true;
	if (tag === "Port") {
		// See if port is using default value default
		if (!isEmpty(value) && value !== "Default") {
			// Make sure port is only a decimal number
			if (!PortNumberRegex.exactMatch(value)) {
				s.log(3, "Port is not a valid decimal number");
				valid = false;
			} else {
				// Make sure port value is in legal TCP port range
				var numeric = parseInt(value, 10);
				if (isNaN(numeric) || numeric < 1 || numeric > 65535) {
					s.log(3, "Port number is not in valid range");
					valid = false;
				}
			}
		}

		// Now try to connect to service to validate port is correct by grabbing
		// list of PDF export presets as a test that should always succeed
		if (valid) {
			var items = libraryItems(s, "presets/export/pdf");
			if (items == null) {
				s.log(3, "Cannot connect to Phoenix.  Make sure Phoenix is running " +
					  "and port and host is correct");
				valid = false;
			}
		}
	} else if (tag === "Hostname") {
		var location = s.getPropertyValue("Host");
		valid = location === "Remote" && !isEmpty(value);
	} else if (tag === "ConcurrencyTimeout") {
		// Make sure request timeout is greater than 0
		var timeout = parseInt(value, 10);
		if (isNaN(timeout) || timeout < 1) {
			valid = false;
		}
	}
	return valid;
}

// Custom property validation callback for connection properties
function isConnectionPropertyValid(s : Switch, c : Connection,
								   tag : String, value : String) {

	var valid = true;
	if (tag === "OutgoingData" && value === "Output Files") {
		// Make sure at least one output file type is enabled
		var hasOutput = false;
		for (var i = 0; i < ExportActions.length; i++) {
			var enabled = c.getPropertyValue(ExportActions[i].option);
			if (enabled === "Yes") {
				hasOutput = true;
				break;
			}
		}
		valid = hasOutput;
		if (!valid) {
			s.log(3, "At least one output type must be included for outgoing " +
				  "data connections");
		}
	}

	return valid;
}

function timestampTag(s : Switch) {
	return s.getFlowName() + "." + s.getElementID() + ".Timestamp";
}

function elementScope(s : Switch) {
	return s.getFlowName() + "." + s.getElementID() + ".Scope";
}

function phoenixJobId(s : Switch, trigger : Job) {
	var id = s.getPropertyValue("PhoenixJobId", trigger);
	if (isEmpty(id)) {
		id = "Plan-" + trigger.getUniqueNamePrefix();
	}
	return id;
}

function runPlan(s : Switch, trigger : Job, jobs : Array, inputMode : String) {
	// Always use trigger file as outgoing job to propagate metadata from
	// input CSV file or artwork file that triggered plan in Direct mode
	var job = trigger;

	// Create new Phoenix job possibly tearing down previous one(s)
	var id = phoenixJobId(s, job);
	var status = new PlanStatus(s);


	// In Direct input mode we need to track job files that cannot be included in
	// output, for example artwork that is too big for the sheet or roll
	var artworkStates = null;

	try {
		queryJobAndCreate(s, job, id, inputMode, status);
		if (status.success()) {
			// Add products to Phoenix job either as CSV import or
			// individual artwork files the came in as Switch jobs
			if (inputMode === "CSV Import") {
				importCsv(s, job, id, status);
			} else if (inputMode === "Direct") {
				// Track product name to artwork job files
				artworkStates = [];

				for (var i = 0; i < jobs.length && status.success(); i++) {
					// Collect all artwork indices generated for this job file to detect
					// when all or part of the artwork cannot be placed on layouts
					var artwork = jobs[i];
					var artworkState = new InputJobState(artwork);
					artworkStates.push(artworkState);

					// If always creating a product per file no need to query page count
					addProduct(s, artwork, id, status, artworkState);
				}
			}

			// For Phoenix job input mode see if we want to run plan
			var runPlan = true;
			if (inputMode === "Phoenix Job") {
				runPlan = s.getPropertyValue("RunPlan", job) === "Yes";
			}

			// Nest job and export to outgoing connections while collecting items that
			// are actually placed on the layout
			var placed = planAndExport(s, job, id, runPlan,
									   artworkStates != null, status);

			// See if any artwork is partially or fully missing from output
			if (artworkStates != null && status.success()) {
				for (var i = 0; i < artworkStates.length; i++) {
					artworkStates[i].checkPlaced(placed);
				}
			}
		}
	} catch (e) {
		status.handleException(e);
	}

	// Delete job and send off input files if needed
	finishWork(s, job, jobs, id, artworkStates, status);
}

function planAndExport(s : Switch, trigger : Job, id : String,
					   runPlan : Boolean, trackPlaced : Boolean, status) {

	// Sanity check to see if in failed state already
	if (!status.success()) {
		return null;
	}

	// Plan current job if needed
	if (runPlan) {
		plan(s, trigger, id, status);
		if (status.success()) {
			// Apply best result from plan
			applyBest(s, trigger, id, status);
		}

		// No need to continue to export if there is a critical failure
		if (!status.success()) {
			return null;
		}
	}

  // Run all configured export actions based on outgoing connection properties
	// recording export state and per-layout reports generated (for dataset)
	var states = {};
	var layoutReports = {};
	var reportPath = null;
	var connections = s.getOutConnections();

	for (var i = 0; i < connections.length; i++) {
		var c = connections.at(i);
		var dataType = c.getPropertyValue("OutgoingData");
		if (dataType !== "Output Files") {
			continue;
		}

		// Keep list of all exports occurring in this connection
		var exports = [];

		for (var j = 0; j < ExportActions.length; j++) {
			// Grab action description and see if action is enabled
			var action = ExportActions[j];
			var enabled = c.getPropertyValue(action.option);
			if (enabled !== "Yes") {
				continue;
			}

			// See if we have a preset which affects export and export
			// state cache
			var preset = null;
			if (action.preset != null) {
				preset = c.getPropertyValue(action.preset);
			}

			// Do export state lookup to see if we've done this work before
			var cacheKey = action.option;
			if (!isEmpty(preset)) {
				cacheKey += preset;
			}

			var state;
			if (cacheKey in states) {
				state = states[cacheKey];
			} else {
				// Perform export, returned path is export state
				state = performExport(s, trigger, preset, id, action);

				// Add state to export states cache
				states[cacheKey] = state;
			}

			if (state.success()) {
				exports.push(state);
			}

			state.log(s, c);
		}

		// Send exported data along
		if (exports.length == 0) {
			trigger.log(2, "Nothing exported from connection: " + c.getFolderName());
			return null;
		}

		// Grab XML report or generate one if we haven't done so already to append as a
		// dataset to all output files or job folders
		var reportState;
		var cacheKey = XmlReportAction.option;
		if (cacheKey in states) {
			reportState = states[cacheKey];
		} else {
			reportState = performExport(s, trigger, null, id, XmlReportAction);
			if (!reportState.success()) {
				trigger.log(3, "Error occurred while generating XML report dataset");
				reportState.logResponseErrorsWarnings(s, c);
			}

			// Add XML report to export states cache
			states[cacheKey] = reportState;
		}

		// Record report path
		if (reportState.success()) {
			reportPath = reportState.path();
		}

		// See if we are accumulating everything into a job folder or sending
		// individual files on their way
		var useJobFolder = c.getPropertyValue("CollectJobFolder") === "Yes";
		if (useJobFolder) {
			// Multiple export actions were performed, create temp folder
			// and copy all export contents there before sending off
			var temp = trigger.createPathWithName(id, true);
			for (var i = 0; i < exports.length; i++) {
				var state = exports[i];
				state.copy(s, temp);
			}
			sendOutput(s, trigger, c, temp, null, null, reportPath, layoutReports);
		} else {
			for (var i = 0; i < exports.length; i++) {
				var state = exports[i];

				if (state.containsFolder()) {
					// Handle JDF case collecting JDF XML file(s) and Contents directory

					// Note: this assumes absolute/relative path JDF export is only action
					// generating a sub-folder which is safe in Phoenix 5.0.  Revisit this
					// logic when adding new output actions
					var temp = trigger.createPathWithName(id, true);
					state.copy(s, temp);
					sendOutput(s, trigger, c, temp, id, state, reportPath, layoutReports);
				} else {
					// Normal case where export contains only file(s).  Send each along
					var contents = state.contents();
					for (var j = 0; j < contents.length; j++) {
						sendOutput(s, trigger, c, contents[j], id, state, reportPath,
								   layoutReports);
					}
				}
			}
		}
	}

	// Collect indices of all placed artwork to detect artwork that is missing
	// in the output
	var placed = null;
	if (trackPlaced && reportPath != null) {
		placed = collectPlacedItems(reportPath, trigger);
	}

	return placed;
}

function sendOutput(s : Switch, job : Job, connection, path, id, state,
					report, layoutReports) {

	// Create job if needed
	if (!job) {
		job = s.createNewJob();
	}

	var file = new File(path);

	// Determine file prefix length based on job ID and optionally export
	// action postfix string
	var prefixLength = 0;
	if (id != null) {
		prefixLength = id.length;
		if (state != null &&
			state.action() != null &&
			state.action().postfix != null) {
			prefixLength += state.action().postfix.length;
		}
	}

	// Check filename to see if it matches a per-layout export file.  If so,
	// use existing per-layout report if cached or generate new one
	if (report != null && prefixLength > 0 && file.name.length > prefixLength) {
		var postfix = file.name.substring(prefixLength, file.name.length);
		if (LayoutPostfixRegex.exactMatch(postfix)) {
			var layout = LayoutPostfixRegex.cap(1);
			job.log(-1, "Per-layout output file detected: " + file.name
					+ ", layout: " + layout);

			if (layout in layoutReports) {
				report = layoutReports[layout];
			} else {
				job.log(-1, "Creating layout-specific report for layout " + layout);
				report = createLayoutReport(report, layout, job);
				if (report != null) {
					layoutReports[layout] = report;
				}
			}
		}
	}

	// Create dataset if XML report is available
	if (report != null) {
		var dataset = job.createDataset("XML");
		s.copy(report, dataset.getPath());
		var name = connection.getPropertyValue("PlanDatasetName");
		job.setDataset(name, dataset);
	}

	job.log(1, "Sending output " + file.name + " to "
			+ connection.getFolderName());

	// Send job on its way
	job.sendTo(connection, path, file.name);
}

// Collect list of artwork files that placed in the job based on report

// Sharing: Griffin (95%, product vs. artwork node names)
function collectPlacedItems(report, job) {
	// First crack open report XML into DOM
	var doc = new Document(report, true);
	if (!doc.isWellFormed()) {
		job.log(2, "Could not open job XML report to collect placed artwork files");
		return null;
	}

	var placed = {};
	var items = childElement(doc.getDocumentElement(), "products");
	if (items != null) {
		var children = items.getChildNodes();
		for (var i = 0; i < children.getCount(); i++) {
			var item = children.at(i);
			var index = childElement(item, "name");
			if (index != null) {
				var text = index.getFirstChild();
				if (text != null) {
					placed[text.getValue()] = true;
				} else {
					job.log(2, "Item ID text missing while parsing XML report");
				}
			} else {
				job.log(2, "Item ID element missing while parsing XML report");
			}
		}
	} else {
		job.log(2, "'products' element not found while parsing XML report");
	}

	return placed;
}

// Pull out layout-specific data from XML report to append to per-layout
// output file as a dataset

// Sharing: Griffin (95%, product vs. artwork node names)
function createLayoutReport(report, layout, job) {
	// First crack open report XML into DOM
	var doc = new Document(report, true);
	if (!doc.isWellFormed()) {
		job.log(2, "Could not open job XML report while generating layout report");
		return null;
	}

	var root = doc.getDocumentElement();
	var edited = false;

	var layouts = childElement(root, "layouts");
	if (layouts != null) {
		var toRemove = [];
		var children = layouts.getChildNodes();

		for (var i = 0; i < children.getCount(); i++) {
			var child = children.at(i);
			var index = childElement(child, "index");
			if (index != null) {
				var contents = index.getFirstChild();
				if (contents != null) {
					var text = contents.getValue();
					if (text !== layout) {
						toRemove.push(child);
					}
				} else {
					job.log(2, "Layout index element empty");
				}
			} else {
				job.log(2, "Index element missing in layout element");
			}
		}

		for (var i = 0; i < toRemove.length; i++) {
			layouts.removeChild(toRemove[i]);
			edited = true;
		}
	} else {
		job.log(2, "'layouts' element not found while parsing XML report");
	}

	// Remove products that are not placed into this layout
	if (edited) {
		var products = childElement(root, "products");
			if (products != null) {
			var toRemove = [];
			var children = products.getChildNodes();

			for (var i = 0; i < children.getCount(); i++) {
				var product = children.at(i);
				if (!itemInLayout(product, layout, job)) {
					toRemove.push(product);
				}
			}

			for (var i = 0; i < toRemove.length; i++) {
				products.removeChild(toRemove[i]);
			}
		} else {
			job.log(2, "'products' element not found while parsing XML report");
		}
	}

	var path;

	if (edited) {
		path = job.createPathWithName(layout + ".xml", false);
		doc.save(path);
	} else {
		// Fall back on original report which means this is single layout job or
		// there was an issue during parsing
		path = report;
	}

	return path;
}

// Sharing: Griffin(100%)
function itemInLayout(item, layout, job) {
	var layouts = childElement(item, "layouts");
	var inLayout = false;

	if (layouts != null) {
		var children = layouts.getChildNodes();

		for (var i = 0; i < children.getCount(); i++) {
			var child = children.at(i);
			var index = child.getAttributeValue("index", null);
			if (index === layout) {
				inLayout = true;
				break;
			}
		}
	} else {
		job.log(2, "Item missing 'layouts' element while parsing XML report");
	}

	return inLayout;
}

// Sharing: Griffin(100%)
function childElement(element, name) {
	var children = element.getChildNodes();

	for (var i = 0; i < children.getCount(); i++) {
		var child = children.at(i);
		if (child.getBaseName() === name) {
			return child;
		}
	}

	return null;
}

function finishWork(s : Switch, job : Job, jobs : Array, id : String,
					jobStates, status) {

	// Done with everything, delete job
	deletePhoenixJob(s, job, id);

	// If we have run into a process failure, mark trigger job as process failure
	// leave all jobs in this nesting group untouched in the input folder
	if (status.isProcessFail()) {
		job.failProcess("Process failure due to unexpected internal error.  If " +
						"problem persists please contact support to resolve.");
		return;
	}

	// Remove private data from input job files to make sure it doesn't effect
	// other flow elements
	var tag = timestampTag(s);
	for (var i = 0; i < jobs.length; i++) {
		jobs[i].setPrivateData(tag, "");
	}

	// Loop through connections looking for Input Files type to see if
	// we need to send input files to any outgoing connections
	var sentSuccesses = false;
	var sentUnplaced = false;
	var connections = s.getOutConnections();

	for (var i = 0; i < connections.length; i++) {
		var c = connections.at(i);
		var dataType = c.getPropertyValue("OutgoingData");
		if (dataType !== "Input Files") {
			continue;
		}

		// Get move when property to see if we should send
		var moveType = c.getPropertyValue("InputFilesMove");
		if (status.success() && jobStates != null) {
			// Success case, send jobs out success connections except any jobs that
			// could not be placed on layouts which go out error connections
			for (var j = 0; j < jobStates.length; j++) {
				var state = jobStates[j];
				if (moveType === "Always" ||
					(moveType === "On success" && state.isFulfilled()) ||
					(moveType === "On error" && !state.isFulfilled())) {
					state.send(c);
				}
			}
			if (moveType !== "On error") {
				sentSuccesses = true;
			}
			if (moveType !== "On success") {
				sentUnplaced = true;
			}
		} else if (moveType === "Always"
			|| (moveType === "On success" && status.success())
			|| (moveType === "On error" && !status.success())) {

			// Non-success or non-Direct input mode case, send all jobs out connection
			// if status matches input files move type
			for (var j = 0; j < jobs.length; j++) {
				var file = jobs[j];
				file.sendTo(c, file.getPath());
			}

			// Mark everything as being sent
			sentSuccesses = true;
			sentUnplaced = true;
		}
	}

	// Move input files to null if not sent out any connection
	if (!sentSuccesses || !sentUnplaced) {
		// Handle Direct mode case where each artwork file can be in fulfilled or
		// unfulfilled state
		if (status.success() && jobStates != null) {
			for (var i = 0; i < jobStates.length; i++) {
				var state = jobStates[i];
				if (!sentSuccesses && state.isFulfilled()) {
					// Silently drop files that were successful
					state.job().sendToNull(state.job().getPath());
				} else if (!sentUnplaced && !state.isFulfilled()) {
					// Send unfulfilled jobs to Problem jobs and log
					state.fail();
				}
			}
		} else {
			for (var i = 0; i < jobs.length; i++) {
				var j = jobs[i];
				if (status.success()) {
					// Success in non-direct mode, send job files to null
					j.sendToNull(j.getPath());
				} else {
					// Whole process failed, send all input files to Problem jobs since there
					// was no 'On error' outgoing connection to send them out
					j.fail("Processing was unsuccessful, sending job to Problem jobs");
				}
			}
		}
	}
}

function queryJobAndCreate(s : Switch, job : Job, id : String,
						   inputMode : String, status) {

	// Check if we have any remnant jobs from a previous server session
	// Remove previous job
	var method = "jobs/" + id;
	var http = phoenixConnect(s, method, "application/json", "None");
	var response = get(s, job, http, "Get Job");
	if (response != null) {
		job.log(1, "Removing previous job " + id);
		deletePhoenixJob(s, job, id);
	}

	var jobFile = null;
	if (inputMode === "Phoenix Job") {
		// Need to create a copy of job using the Job ID as filename in local case
		// to ensure no race conditions where the file is not being held onto by
		// Phoenix when moved to an input file connection.  In remote case to ensure
		// MIME filename fields has the ID in it.  Phoenix REST service uses MIME
		// filename as the ID when it opens the job
		jobFile = job.createPathWithName(id + ".phx");
		if (!s.copy(job.getPath(), jobFile)) {
			status.recordError("Could not make temp copy of PHX file before opening");
			return;
		}
	}

	// See if we are creating a job or opening it locally
	var remote = s.getPropertyValue("Host") === "Remote";
	if (jobFile == null || !remote) {
	// Build JSON Create Job request in temp file
		var json = new Json(s, job);
		json.add("id", id);

		// If running in Phoenix Job mode, add the job as a job template to open
		// job in backwards compatible way with Phoenix 6.1 and earlier
		if (jobFile != null) {
			json.add("template-path", jobFile);
		}
		json.commit();

		// Connect to Phoenix and post request
		http = phoenixConnect(s, "jobs", "application/json", "Entity");
		http.setAttachedFile(json.path());
		response = post(s, job, http, "Create Job");
		status.handleResponse(response, "Create job");
		if (status.success()) {
			job.log(1, "Created Phoenix job " + id);
		}
	} else {
		// Open Phoenix job remotely
		http = phoenixConnect(s, "jobs/open", "application/json", "Upload");

		// Allow 30 minutes to upload big files
		http.timeOut = 1800;
		http.setAttachedFile(jobFile);
		var response = post(s, job, http, "Open Job");
		status.handleResponse(response, "Open Job");
		if (status.success()) {
			job.log(1, "Opened Phoenix job " + id);
		}
	}
}

function deletePhoenixJob(s : Switch, logger, id : String) {
	var method = "jobs/" + id;
	var http = phoenixConnect(s, method, "application/json", "None");
	var response = del(s, logger, http, "Delete Job");
	return response != null;
}

function addProduct(s : Switch, job : Job, id : String, status,
					artworkState) {

	job.log(-1, "Adding product to Phoenix job " + job.getName());

	// Add product to job by building an add product request
	var json = new Json(s, job);

	// Product name fallback to filename of incoming artwork file
	var name = s.getPropertyValue("ProductName", job);
	if (isEmpty(name)) {
		name = job.getNameProper();
	}
	json.add("name", name);

	// Add inbound job path as artwork path and check to see if job file
	// path failed in case it is performing upload to Phoenix
	json.add("artwork", jobFilePath(s, job, id, status));
	if (!status.success()) {
		return;
	}

	// Add common product properties
	json.addProperty("ProductOrdered", "ordered");
	json.addProperty("ProductGrain", "grain");
	json.addProperty("ProductStock", "stock");
	json.addProperty("StockGrade", "grade");
	json.addProperty("ProductMinOverruns", "min-overruns", true);
	json.addProperty("ProductMaxOverruns", "max-overruns", true);
	json.addProperty("ProductGroup", "group");
	json.addProperty("ProductDueDate", "due-date");
	json.addProperty("ProductNotes", "notes");
	json.addProperty("ProductDescription", "description");
	json.addArrayProperty("ProductTemplates", "templates");

	// See what type of product we are adding
	var type = s.getPropertyValue("ProductType", job);
	var pageHandling = "OnePerFile";
	if (isEmpty(type)) {
		type = "Flat";
	}
	json.add("type", type);

	if (type === "Bound") {
		json.addArrayProperty("FoldingPatterns", "folding-patterns");

		var bindingMethod = json.enumValue("BindingMethod");
		json.add("binding-method", bindingMethod);
		if (bindingMethod === "SaddleStitch") {
			json.addProperty("PagesPerSection", "pages-per-section");
		}
		json.addProperty("BindingEdge", "binding-edge");
		json.addProperty("JogEdge", "jog-edge");

		var readingOrder = s.getPropertyValue("ReadingOrder", job);
		json.add("reading-order", readingOrder);
		if (readingOrder === "Calendar") {
			json.addYesNoProperty("SelfCover", "self-cover");
		}
		json.addProperty("PageBleed", "page-bleed");

		// Add trim settings
		json.startField("trim");
		json.startDict();
		json.addProperty("SpineTrim", "spine-trim");
		json.addProperty("JogTrim", "jog-trim");
		json.addProperty("FaceTrim", "face-trim");
		json.addProperty("NonJogTrim", "non-jog-trim");
		json.addProperty("LipType", "lip-type");
		json.addProperty("Lip", "lip");
		json.endDict();

		// Add N-up settings
		var nUp = s.getPropertyValue("NUp", job);
		json.startField("n-up");
		json.startDict();
		json.add("number", nUp);
		if (nUp !== "1") {
			json.addProperty("NUpGap", "gap");
		}
		json.endDict();

		// Add creep settings
		var creep = s.getPropertyValue("Creep", job);
		if (creep !== "None") {
			json.startField("creep");
			json.startDict();
			json.add("type", creep);
			if (creep === "Custom") {
				json.addProperty("CreepTransition", "transition");
			}
			json.addProperty("CreepMethod", "method");
			var calculation = json.enumValue("CreepCalculation");
			json.add("calculation", calculation);
			if (calculation !== "FromStock") {
				json.addProperty("CreepAmount", "amount");
			}
			json.endDict();
		}
	} else if (type === "Folded") {
		json.addArrayProperty("FoldingPattern", "folding-patterns");
		json.addProperty("PageBleed", "page-bleed");
	} else {
		// Flat and tiled product type case, get multipage handling option for
		// this artwork
		var multipage = s.getPropertyValue("PageHandling", job);

		if (multipage === "One product per page") {
			pageHandling = "OnePerPage";
			json.addProperty("FrontToBack", "front-to-back");
		} else if (multipage === "One product per two pages") {
			pageHandling = "OnePerTwoPages";
		}
		json.add("page-handling", pageHandling);
		json.addProperty("ShapeHandling", "shape-handling");

		// Add dieshape related properties
		var dieshape = s.getPropertyValue("ProductDieshape", job);

		if (dieshape === "Line Type Mappings") {
			json.add("dieshape-source", "ArtworkPaths");
		} else if (dieshape === "CAD") {
			json.add("dieshape-source", "CAD");
			json.addProperty("DieshapeCadFile", "cad-file");
			json.addProperty("DieshapeCadDesign", "cad-design");
		} else if (dieshape === "Custom Size") {
			json.add("dieshape-source", "CustomSize");
			json.addProperty("DieshapeWidth", "width");
			json.addProperty("DieshapeHeight", "height");
		} else if (dieshape === "Artwork TrimBox") {
			json.add("dieshape-source", "ArtworkTrimbox");
		} else if (dieshape === "Artwork Layers") {
			// Legacy options with no corresponding dieshape source
			json.addProperty("DieshapeCutLayer", "cut-layer");
			json.addProperty("DieshapeCreaseLayer", "crease-layer");
			json.addProperty("DieshapeBleedLayer", "bleed-layer");
		} else if (dieshape === "Artwork Inks") {
			json.addProperty("DieshapeCutInk", "cut-ink");
			json.addProperty("DieshapeCreaseInk", "crease-ink");
			json.addProperty("DieshapeBleedInk", "bleed-ink");
		} else if (dieshape === "Die Design Library") {
			json.addProperty("DieDesignName", "die-design");
		}

		// Add autosnap properties
		var autosnap = s.getPropertyValue("ProductAutosnap", job);
		if (autosnap === "Autosnap with Ink") {
			json.addProperty("AutosnapInk", "autosnap-ink");
			json.addProperty("BackAutosnapInk", "back-autosnap-ink");
		} else if (autosnap === "Autosnap with Layer") {
			json.addProperty("AutosnapLayer", "autosnap-layer");
			json.addProperty("BackAutosnapLayer", "back-autosnap-layer");
		}

		// If type is tiled add tiling settings
		if (type === "Tiled") {
			addTiling(s, job, json);
		}
	}

	// Add spacing properties
	var spacingType = s.getPropertyValue("ProductSpacingType", job);
	if (spacingType === "Margins") {
		json.add("spacing-type", "Margins");
		json.addMargins("ProductSpacing", "spacing-margins");
	} else if (spacingType === "Contour") {
		json.add("spacing-type", "Uniform");
		json.addProperty("ProductSpacing", "spacing-margin");
	} else {
		json.add("spacing-type", "Bleed");
	}

	// Set bleed related properties
	var bleedType = s.getPropertyValue("ProductBleedType", job);
	if (bleedType === "Margins") {
		json.add("bleed-type", "Margins");
		json.addMargins("ProductBleed", "bleed-margins");
	} else if (bleedType === "Contour") {
		// Set bleed offset if not Default
		var bleed = s.getPropertyValue("ProductBleed", job);
		if (!isEmpty(bleed) && bleed !== "Default") {
			json.add("bleed-type", "Contour");
			json.add("bleed-margin", bleed);
		}
	} else if (bleedType === "None") {
		json.add("bleed-type", "None");
	}

	// Set offcut margins if needed
	var offcut = s.getPropertyValue("Offcut", job);
	if (offcut === "Margins") {
		json.addMargins("Offcut", "offcut-margins");
	}

	// Add rotation properties
	var rotation = s.getPropertyValue("Rotation", job);
	if (!isEmpty(rotation)) {
		json.add("rotation", rotation);
		if (rotation === "Custom") {
			json.addProperty("ProductRotations", "allowed-rotations");
		}
	}

	// Add front and back inks
	json.addArrayProperty("FrontInks", "front-inks");
	json.addArrayProperty("BackInks", "back-inks");

	// Add front and back marks
	json.addArrayProperty("Marks", "marks");
	json.addArrayProperty("BackMarks", "back-marks");

	// Set priority if needed
	var priority = s.getPropertyValue("ProductPriority", job);
	if (!isEmpty(priority) && priority !== "Default") {
		json.add("priority", priority);
	}

	// Add custom properties which are defined as name=value pairs
	var propPairs = multiValues(s, job, "CustomProperties");
	if (propPairs != null) {
		var started = false;
		for (var i = 0; i < propPairs.length; i++) {
			var pair = propPairs[i];

			if (PropNameValueRegex.exactMatch(pair)) {
				var name = PropNameValueRegex.cap(1);
				var value = PropNameValueRegex.cap(2);

				// Start properties array if needed
				if (!started) {
					json.startArray("properties");
					started = true;
				} else {
					json.addArraySeparator();
				}

				// Add custom property entry which defaults to Text when type not set
				json.startDict();
				json.add("name", name);
				json.add("value", value);
				json.endDict();
			} else {
				job.log(2, "Invalid custom property format: '%1', expected " +
						"format for each property is NAME=VALUE", pair);
			}
		}

		// End properties array if needed
		if (started) {
			json.endArray();
		}
	}

	json.commit();

	// Post add product request
	var method = "jobs/" + id + "/products";
	var http = phoenixConnect(s, method, "application/json", "Entity");
	// Set timeout to 2 minutes to add individual product
	http.timeOut = 120;
	http.setAttachedFile(json.path());
	var response = post(s, job, http, "Add Product");
	status.handleResponse(response, "Add Product");
	job.log(-1, "Add product result %1", response);

	// Record product name in artwork state for place count tracking after
	// plan has been generated and applied to this project
	if (status.success()) {
		// Resources will contain all added artwork URLs, parse index
		var resources = status.resources();
		var page = 1;

		for (var i = 0; i < resources.length; i++) {
			artworkState.addMapping(resources[i], page);

			// Track page number in artwork file this product came from
			if (pageHandling === "OnePerPage") {
				page += 1;
			} else {
				page += 2;
			}
		}
	}
}

function importCsv(s : Switch, job : Job, id : String, status) {
	job.log(1, "Importing CSV " + job.getPath());

	// Create CSV import request
	var json = new Json(s, job);
	json.addProperty("CsvImportPreset", "preset", false);
	json.addProperty("CsvImportBaseFolder", "base-folder", false);

	// Set path which could be a URL if uploading CSV remotely in which case
	// status can change to failed if there were problems during upload
	json.add("path", jobFilePath(s, job, id, status));
	if (!status.success()) {
		return;
	}

	json.commit();

	// Post import CSV request
	var method = "jobs/" + id + "/products/import/csv";
	var http = phoenixConnect(s, method, "application/json", "Entity");
	// Allow 30 minutes for import to account for large numbers of heavy files
	http.timeOut = 1800;
	http.setAttachedFile(json.path());
	var response = post(s, job, http, "Import CSV");
	status.handleResponse(response, "Import CSV");
}

// Add tiling options to add artwork JSON request entity
function addTiling(s : Switch, job : Job, json : Json) {
	// Get tiling methods in both directions
	var hRule = s.getPropertyValue("TilingH", job);
	var vRule = s.getPropertyValue("TilingV", job);

	// If both methods are none then no tiling happening so just warn and return
	if (hRule === "None" && vRule === "None") {
		job.log(2, "Horizontal and vertical tiling both set to \"None\", no " +
				"tiling will be performed");
		return;
	}

	// Start tiling entity and set tiling order fields
	json.startField("tiling");
	json.startDict();
	json.add("type", "StandardTiling");
	json.addEnumProperty("TilingStart", "start");
	json.addEnumProperty("TilingOrder", "order");

	// Add horizontal and vertical tiling rules
	addTilingRule("horizontal", hRule, s, job, json);
	addTilingRule("vertical", vRule, s, job, json);
	json.endDict();
}

// Add tiling rule in single direction
function addTilingRule(dimension : String, rule : String, s : Switch,
					   job : Job, json : Json) {

	if (rule === "None") {
		return;
	}

	// Set property tag postfix
	var postfix = dimension.left(1).upper();

	// Add tiling rule entity
	json.startField(dimension + "-rule");
	json.startDict();
	if (rule === "Fixed number") {
		json.add("type", "FixedNumber");
		json.addProperty("TilingNumber" + postfix, "number");
		json.addYesNoProperty("TilingUniform" + postfix, "uniform-final-size");
	} else if (rule === "Fixed size") {
		json.add("type", "FixedSize");
		json.addProperty("TilingSize" + postfix, "size");
	} else if (rule === "Variable sizes") {
		json.add("type", "VariableSizes");
		json.addArrayProperty("TilingSizes" + postfix, "sizes");
	} else {
		job.log(2, "Tiling rule value invalid in the " + dimension + " dimension");
	}
	json.endDict();

	// Add tiling method entity
	var method = s.getPropertyValue("TilingMethod" + postfix, job);
	if (method !== "None") {
		json.startField(dimension + "-method");
		json.startDict();
		var method = s.getPropertyValue("TilingMethod" + postfix, job);
		json.add("type", method);
		if (method === "Gap") {
			json.addProperty("TilingGapSize" + postfix, "gap");
			json.addProperty("TilingGapExtension" + postfix, "extension");
			json.addEnumProperty("TilingGapExtensionRule" + postfix, "extension-rule");
		} else {
			json.addEnumProperty("TilingOverlapRule" + postfix, "overlap-rule");
			json.addProperty("TilingOverlapSize" + postfix, "overlap");
			json.addProperty("TilingOverlapNoImage" + postfix, "no-image");
		}
		json.endDict();
	}
}

function plan(s : Switch, job : Job, id : String, status) {
	job.log(1, "Planning job " + id);

	// Build plan request
	var json = new Json(s, job);
	var profile = json.propertyValue("GangingProfile", null);
	if (!isEmpty(profile)) {
		json.addArray("profiles", [profile]);
	}

	json.addProperty("GangingProfile", "profile", false);
	json.addProperty("StopAfter", "stop-minutes", false);
	json.addArrayProperty("Presses", "presses");
	json.addArrayProperty("Templates", "templates");
	addGradeItems(json, "sheets", "Sheets", "SelectedSheets");
	addGradeItems(json, "rolls", "Rolls", "SelectedRolls");
	json.commit();

	var method = "jobs/" + id + "/plan";
	var http = phoenixConnect(s, method, "application/json", "Entity");
	http.setAttachedFile(json.path());

	// Wait indefinitely
	http.timeOut = 0;
	var response = post(s, job, http, "Plan");
	status.handleResponse(response, "Plan");
	job.log(-1, "Plan result %1", response);
}

function addGradeItems(json, name : String, selectMode : String,
					   listTag : String) {

	// See if sheets or rolls is in Select mode
	var mode = json.propertyValue(selectMode, null);
	if (mode !== "Select") {
		return;
	}

	var items = multiValues(json.s(), json.job(), listTag);
	if (items == null) {
		return;
	}

	json.startArray(name);
	for (var i = 0; i < items.length; i++) {
		// Try parsing sheet or roll which is defined as stock/grade/item
		var value = items[i];
		var parts = value.split("/");
		if (parts.length < 2 || parts.length > 3) {
			var type = name.left(name.length - 1);
			json.job().log(2, "Skipping %1 with value %2 because it does not match " +
						   "required format \"stock/grade/%1\"".arg(type).arg(value));
			continue;
		}

		if (i > 0) {
			json.addArraySeparator();
		}
		json.startDict();
		json.add("stock", parts[0]);
		json.add("name", parts[parts.length - 1]);
		if (parts.length == 3) {
			json.add("grade", parts[1]);
		}
		json.endDict();
	}
	json.endArray();
}

function applyBest(s : Switch, job : Job, id : String, status) {
	// Get best plan result, i.e. lowest cost
	var method = "jobs/" + id + "/plan/results?limit=1";
	var http = phoenixConnect(s, method, "application/json", "None");
	var response = get(s, job, http, "Get Best Plan Result");
	if (response == null) {
		status.recordProcessFail("Getting plan results failed");
		return;
	}

	// Convert JSON text into JS object
	var results = eval(response);
	if (results.length == 0) {
		status.recordError("No plan results found, please review planning " +
						   "warnings.  You might need to increase allowed planning time");
		return;
	}

	// Get ID of best result
	var planId = results[0].id;
	job.log(1, "Applying best plan (ID %1)", planId);

	// Apply this plan to the current job
	var method = "jobs/" + id + "/plan/results/" + planId + "/apply";
	var http = phoenixConnect(s, method, "application/json", "None");

	// Wait indefinitely, applying plans can take a long time if hundreds or
	// thousands of layouts are generated.  See TLHD-848
	http.timeOut = 0;
	var response = post(s, job, http, "Apply Plan");
	status.handleResponse(response, "Apply Plan");
	job.log(-1, "Apply Best result %1", response);
}

function performExport(s : Switch, job : Job, preset, id, action, status) {
	job.log(-1, "Running %11, ID: %12", action.name + "," + id);
	var exportFolder = job.createPathWithName(id, true);

	// Create Export resource in JSON with optional preset
	var json = new Json(s, job);
	if (!isEmpty(preset)) {
		json.add("preset", preset);
	}

	// Build up full local path using job ID and extension unless accessing
	// remote in which case don't set path so Phoenix saves on server side
	var remote = s.getPropertyValue("Host") === "Remote";
	if (!remote) {
		var exportPath = exportFolder + "/" + id;
		if (action.postfix) {
			exportPath += action.postfix;
		}
		if (action.extension) {
			exportPath += "." + action.extension;
		}
		json.add("path", exportPath);
	}

	json.commit();

	// Build method URI, connect, attach JSON resource and post
	var url = "jobs/" + id + action.method;
	var http = phoenixConnect(s, url, "application/json", "Entity");
	// Most exports should be done within a few seconds but allow 30 minutes for
	// potentially slow exports like PDF cover sheet export and PDF report with
	// artwork rendering.  See PLNCFR-35
	http.timeOut = 1800;
	http.setAttachedFile(json.path());

	var response = post(s, job, http, action.name);
	return new ExportState(s, action, remote, exportFolder, id, response);
}

function jobFilePath(s : Switch, job : Job, id : String, status) {
	var path = job.getPath();
	var location = s.getPropertyValue("Host");
	if (location === "Remote") {
		var mode = s.getPropertyValue("FileInputMode");
		if (mode === "Upload") {
			// Upload this file to Phoenix and use URL returned back as path
			var method = "jobs/" + id + "/files/upload";
			var http = phoenixConnect(s, method, "application/json", "Upload");
			// Allow 30 minutes to upload big files
			http.timeOut = 1800;
			http.setAttachedFile(path);
			var response = post(s, job, http, "Upload File");
			status.handleResponse(response, "Upload File");
			if (status.success()) {
				// Pull out URL
				if (status.resources().length == 0) {
					status.recordError("No URL returned when uploading job " + path);
				} else {
					path = status.resources()[0];
				}
			}
		} else {
			var sharePath = s.getPropertyValue("InputSharePath");
			if (!isEmpty(sharePath)) {
				// Get file name
				var file = new File(path);
				var name = file.name;

				// See what separator to use and if we need to add another to the end
				if (sharePath.indexOf("/") >= 0 && !sharePath.endsWith("/")) {
					sharePath += "/";
				} else if (sharePath.indexOf("\\") >= 0 && !sharePath.endsWith("\\")) {
					sharePath += "\\";
				}

				// Add job file name to share path
				path = sharePath + name;
			} else {
				job.log(2, "Required Input share path is empty, remote Phoenix instance "
					  + "may not be able to access input file");
			}
		}
	}
	return path
}

function phoenixConnect(s : Switch, method : String, encoding : String,
						dataMode : String) {

	var http = new HTTP(HTTP.NoSSL);
	http.authScheme = HTTP.NoneAuth;

	// Set accept header for response
	http.addHeader("Accept", encoding);

	// Set content type header for request payload
	if (dataMode === "Entity") {
		http.addHeader("Content-Type", encoding);
	} else if (dataMode === "Upload") {
		http.enableMime = true;
	}

	var url;
	// If method is full URL use that
	if (method.startsWith("http://")) {
		url = method;
	} else {
		// get port number of property
		var port = s.getPropertyValue("Port");
		if (isEmpty(port) || port === "Default") {
			port = DefaultPort;
		}

		// Get hostname if running remotely
		var hostname = null;
		var location = s.getPropertyValue("Host");
		if (location === "Remote") {
			hostname = s.getPropertyValue("Hostname");
		}

		if (isEmpty(hostname)) {
			hostname = "localhost";
		}

		url = "http://" + hostname + ":" + port + "/phoenix/" + method;
	}

	http.url = HTTP.encodeURI(url);
	return http;
}

function get(s : Switch, logger, http : HTTP, action : String) {
	logger.log(-1, "Starting GET to " + http.getUrl());
	var start = new Date();
	do {
		http.get();
		while (!http.waitForFinished(1)) {
			logger.log(5, "Waiting for HTTP GET to finish", http.progress());
		}

		if (http.finishedStatus == HTTP.Ok && http.statusCode == 200) {
			// If using local file path just return OK string
			if (!isEmpty(http.localFilePath)) {
				return "OK";
			}
			var bytes = http.getServerResponse();
			return bytes.toString("UTF-8");
		}
	} while (retryRequest(s, action, http, start, logger));

	return null;
}

function post(s : Switch, logger, http : HTTP, action : String) {
	logger.log(-1, "Starting POST to " + http.getUrl());
	var start = new Date();
	var done = false;
	while (!done) {
		http.post();
		while (!http.waitForFinished(3)) {
			logger.log(5, "Waiting for HTTP POST to finish", http.progress());
		}

		logger.log(-1, "POST done, status: " + http.getStatusCode());
		if (http.finishedStatus == HTTP.Ok) {
			// For post we will want to return the error message from Phoenix when
			// concurrent limit exceeded and retry timeout also exceeded
			if (!retryRequest(s, action, http, start, logger)) {
				var bytes = http.getServerResponse();
				return bytes.toString("UTF-8");
			}
		} else {
			done = true;
		}
	}

	return null;
}

function del(s : Switch, logger, http : HTTP, action : String) {
	logger.log(-1, "Starting DEL to " + http.getUrl());
	var start = new Date();
	do {
		http.del();
		while (!http.waitForFinished(1)) {
			logger.log(5, "Waiting for HTTP DELETE to finish", http.progress());
		}

		if (http.finishedStatus == HTTP.Ok && http.statusCode == 200) {
			var bytes = http.getServerResponse();
			return bytes.toString("UTF-8");
		}
	} while (retryRequest(s, action, http, start, logger));

	return null;
}

function retryRequest(s : Switch, action : String, http : HTTP,
					  start : Date, logger) {

	// First see if finished status is failed and 503 received indicating
	// Phoenix is at max cuncurrent requests right now
	if (http.getStatusCode() != 503) {
		return false;
	}

	// Phoenix should be setting retry-after header to indicate this is a
	// temporary resource problem, retrieve value (in seconds)
	var retryAfter = http.getHeaderValue("Retry-After");
	if (!retryAfter || retryAfter.length == 0) {
		logger.log(3, "Concurrency limit Retry-After header missing");
		return false;
	}

	// Use the retry-after header value from Phoenix as amount of time to wait
	var retry = 30;
	var value = parseInt(retryAfter.toString("UTF-8"), 10);
	if (isNaN(value) || value <= 0) {
		logger.log(2, "Concurrency limit Retry-After unexpected value");
	} else {
		retry = value;
		logger.log(-1, "Concurrency limit Retry-After value: " + retry);
	}

	// See how much time is left before we exceed request timeout
	var timeout = parseInt(s.getPropertyValue("ConcurrencyTimeout")) * 60;
	var current = new Date();
	var diff = (current.getTime() - start.getTime()) / 1000;
	if (diff >= timeout) {
		// Exceeded timeout, log error and give up
		logger.log(3, "Exceeded max request timeout for action " + action
				   + ", if this happens often resolve by increasing request timeout "
				   + "or increasing capacity in Phoenix");
		return false;
	}

	// Sleep for retry amount or leftover time, whichever is smaller
	var sleep = timeout - diff;
	if (sleep > retry) {
		sleep = retry;
	}

	// Go from info to warning log when retry goes on for 2+ minutes
	logger.log(diff >= 120 ? 2 : 1, "Phoenix is at max concurrency, retrying "
			   + "request in " + sleep + " seconds");

	s.sleep(sleep);
	return true;
}

// Helper method to return a list of values for multi-value properties while
// supporting the newline convention in Script Expressions
function multiValues(s : Switch, job : Job, tagName : String) {
	// See if list has valid value and is not a single empty string
	var values = s.getPropertyValueList(tagName, job);
	if (values == null || values.length == 0) {
		return null;
	}

	// Split each value by new line and commas to cover script expression
  // and single text editor cases where list is not returned
  var array = [];
	for (var i = 0; i < values.length; ++i) {
		var split1 = values[i].split("\n");
		for (var j = 0; j < split1.length; ++j) {
			var split2 = split1[j].split(",");
			for (var k = 0; k < split2.length; ++k) {
				if (!isEmpty(split2[k])) {
					array.push(split2[k]);
				}
			}
		}
	}

	if (array.length == 0) {
		return null;
	}

	return array;
}

// Helper method to test for null, undefined, and empty string
function isEmpty(str) {
	return !str || str.length === 0;
}

// Helper method tests if array contains at least one string with given value
function arrayContains(array : Array, value : String) {
	for (var i = 0; i < array.length; ++i) {
		if (value === array[i]) {
			return true;
		}
	}
	return false;
}

// Plan status class contains list of errors/warnings and overall success
class PlanStatus {

	var _switch;
	var _success;
	var _processFail;
	var _warnings;
	var _errors;
	var _resources;

	function PlanStatus(s) {
		_switch = s;
		_success = true;
		_warnings = [];
		_errors = [];
		_resources = [];
	}

	function success() {
		return _success;
	}

	function isProcessFail() {
		return _processFail;
	}

	function warnings() {
		return _warnings;
	}

	function addWarning(text) {
		_warnings.push(text);
		_switch.log(2, text);
	}

	function errors() {
		return _errors;
	}

	function recordError(text) {
		// Set overall status to fail and add error to list
		_success = false;
		_errors.push(text);

		// Log error in Switch
		_switch.log(3, text);
	}

	function recordProcessFail(text) {
		// Set success and process fail flags
		this.recordError(text);
		_processFail = true;
	}

	function resources() {
		return _resources;
	}

	function handleResponse(responseText, actionName) {
		// If no response from webserver most likely connection or unexpected
		// error on server side, record as process failure since most likely
		// not due to user configuration or input data problem
		if (!responseText) {
			this.recordProcessFail(actionName + " request failed.  "
							 + "Make sure Phoenix automation is running");
		} else {
			// Parse response text into JSON object
			var response = eval(responseText);
			if (response.warnings) {
				for (var i = 0; i < response.warnings.length; i++) {
					this.addWarning(response.warnings[i].text);
				}
			}
			if (response.errors) {
				// Response errors assumed to be problem jobs so record as normal errors
				for (var i = 0; i < response.errors.length; i++) {
					this.recordError(response.errors[i].text);
				}
			}

			// Record only most recent result resources
			_resources = [];
			if ("resources" in response && response.resources) {
				for (var i = 0; i < response.resources.length; i++) {
					// NOTE: no URL decoding done on resource text, caller is responsible
					// for decoding if needed (e.g. product name)
					_resources.push(response.resources[i]);
				}
			}
			if ("success" in response && !response.success) {
				_success = false;
			}
		}
	}

	function handleException(e) {
		// Try to get a meaningful message from the exception
		var text;
		if (e) {
			text = "" + e;
		} else {
			text = "Unknown error occurred";
		}

		// Assume this is a process failure so jobs stay in input folder until
		// problem is resolved
		this.recordProcessFail(text);
	}
}

// Export state creates and holds onto the temp folder used for export and
// the response from the server containing success/fail and warnings/errors
class ExportState {

	var _action;
	var _path;
	var _empty;
	var _filename;
	var _response;
	var _isFolder;
	var _containsFolder;

	function ExportState(s, action, remote, folder, id, responseText) {
		_action = action;
		_path = folder;
		_empty = false;
		_isFolder = true;
		_containsFolder = false;

		// Evaluate response to access JSON data
		if (responseText) {
			_response = eval(responseText);

			// Download exported files if Phoenix is not local
			if (remote) {
				downloadFiles(s, action, folder, id);
			}
		} else {
			_response = null;
		}

		// See if we exported a single file in which case we
		// point path to file instead of parent folder
		var dir = new Dir(folder);
		var types = Dir.Dirs | Dir.Files | Dir.NoDotAndDotDot;
		var list = dir.entryList("*", types, Dir.Name);
		if (list.length == 0) {
			_empty = true;
		} else if (list.length == 1) {
			var fullPath = folder + "/" + list[0];
			if (File.isFile(fullPath)) {
				_path = fullPath;
				_isFolder = false;
			}
		}

		// Record whether or not output contains a folder
		if (_isFolder) {
			for (var i = 0; i < list.length; i++) {
				if (File.isDir(folder + "/" + list[i])) {
					_containsFolder = true;
					break;
				}
			}
		}

		// Special case for relative/absolute JDF, rename ".mjd" extension
		// MIME JDF extension to the correct XML based ".jdf" extension if
		// a sub-folder is detected (relative/absolute JDF "Content" folder)
		if (!remote && _isFolder && _action.extension === "mjd") {
			// Not MIME JDF, rename file extensions from mjd to jdf
			if (_containsFolder) {
				for (var i = 0; i < list.length; i++) {
					var fullPath = folder + "/" + list[i];
					if (File.isFile(fullPath) && fullPath.endsWith("mjd")) {
						var dest = fullPath.substring(0, fullPath.length - 3) + "jdf";
						s.move(fullPath, dest);
					}
				}
			}
		}

		var file = new File(_path);
		_filename = file.name;
	}

	function action() {
		return _action;
	}

	function path() {
		return _path;
	}

	function filename() {
		return _filename;
	}

	function isFolder() {
		return _isFolder;
	}

	function containsFolder() {
		return _containsFolder;
	}

	function copy(s, folder) {
		var paths = this.contents();
		for (var i = 0; i < paths.length; i++) {
			var source = paths[i];
			var file = new File(source);
			var dest = folder + "/" + file.name;
			s.copy(source, dest);
		}
	}

	function contents() {
		var paths = [];

		if (this.isFolder()) {
			var dir = new Dir(this.path());
			var types = Dir.Dirs | Dir.Files | Dir.NoDotAndDotDot;
			var list = dir.entryList("*", types, Dir.Name);
			for (var i = 0; i < list.length; i++) {
				paths.push(this.path() + "/" + list[i]);
			}
		} else {
			paths.push(this.path());
		}

		return paths;
	}

	function downloadFiles(s : Switch, action, folder : String, id : String) {
		// See if export saved on server-side, if so download
		if (!_response ||
			!_response.resources ||
			_response.resources.length == 0) {
			return;
		}

		// Desired local output filename minus extension
		var localName = id;
		if (action.postfix) {
			localName += action.postfix;
		}

		// Track local sub-folders created during download to match folder heirarchy
		// of files stored on Phoenix to handle the infamous JDF "Contents" folder
		var localFolders = [];

		for (var i = 0; i < _response.resources.length; ++i) {
			// Grab filename part of URI, decode, and replace name with desired name
			var uri = _response.resources[i];
			var parts = uri.split(/\/files\/output\/[0-9]+\//);
			var relative = HTTP.decodeURIComponent(parts[1]);

			// See if relative path contains sub-folders which we want to preserve
			var localPath;
			var paths = relative.split("/");
			if (paths.length > 1) {
				// Note: Phoenix output will only ever be one folder deep (JDF)
				if (!arrayContains(localFolders, paths[0])) {
					var dir = new Dir(folder);
					dir.mkdir(paths[0]);
					localFolders.push(paths[0]);
				}
				localPath = relative;
			} else {
				localPath = relative.replace(/^output/, localName);
			}

			// Do download direct to local file
			var http = phoenixConnect(s, uri, "application/octet-stream", "None");
			http.localFilePath = folder + "/" + localPath;
			s.log(-1, "Downloading " + uri + " to " + http.localFilePath);
			var result = get(s, s, http, "Download");
			if (!result) {
				s.log(3, "Failed to download output " + uri);
				_response.success = false;
			}
		}
	}

	function success() {
		return !_empty && _response && _response.success;
	}

	function log(logger, c) {
		if (success()) {
			logger.log(1, action().name + " succeeded for connection "
					   + c.getFolderName());
		} else {
			logger.log(3, action().name + " failed for connection "
					   + c.getFolderName());

			logResponseErrorsWarnings(logger, c);
		}
	}

	function logResponseErrorsWarnings(logger, c) {
		if (_response) {
			if (_response.errors) {
				for (var i = 0; i < _response.errors.length; i++) {
					logger.log(3, _response.errors[i].text);
				}
			}
			if (_response.warnings) {
				for (var i = 0; i < _response.warnings.length; i++) {
					logger.log(2, _response.warnings[i].text);
				}
			}
		}
	}
}

// Collection of arrived jobs that have same plan identifier
class PlanGroup {

	var _planId;
	var _jobs;
	var _oldestJob;
	var _oldestTime;

	function PlanGroup(planId) {
		_planId = planId;
		_jobs = [];
		_oldestJob = null;
		_oldestTime = null;
	}

	function addJob(job, data) {
		// Add job to group
		_jobs.push(job);

		// See if this is oldest job in the group
		var timestamp = Date.parse(data);
		if (_oldestJob === null || timestamp < _oldestTime) {
			_oldestJob = job;
			_oldestTime = timestamp;
		}
	}

	function matches(planId) {
		return _planId === planId;
	}

	function jobs() {
		return _jobs;
	}

	function oldestJob() {
		return _oldestJob;
	}

	function oldestTime() {
		return _oldestTime;
	}

	function conditionMet(s, tagName) {
		for (var i = 0; i < _jobs.length; ++i) {
			var condition = s.getPropertyValue(tagName, _jobs[i]);
			if (condition === "true") {
				return true;
			}
		}
		return false;
	}

	function containsJobWithName(name : String) {
		for (var i = 0; i < _jobs.length; ++i) {
			if (name === _jobs[i].getUniqueNamePrefix()) {
				return true;
			}
		}
		return false;
	}
}

// Artwork input file state records product index to page number mappings to
// track which artwork pages are successfully placed in layouts
class InputJobState {

	var _job;
	var _mappings;
	var _error;

	function InputJobState(job : Job) {
		_job = job;
		_mappings = [];
		_error = null;
	}

	function job() {
		return _job;
	}

	function isFulfilled() {
		return _error == null;
	}

	function errorMessage(folder : String) {
		return "%1, sending to %2".arg(_error).arg(folder);
	}

	function send(c : Connection) {
		this.job().sendTo(c, this.job().getPath());
		if (!this.isFulfilled()) {
			this.job().log(3, this.errorMessage(c.getFolderName()));
		}
	}

	function fail() {
		this.job().fail(this.errorMessage("Problem jobs"));
	}

	// Add artwork index from add artwork response resource
	function addMapping(resource, page) {
		var pos = resource.lastIndexOf("/");
		if (pos == -1) {
			this.job().log(2, "No index found in add artwork response: " + resource);
		} else {
			var id = resource.substring(pos + 1, resource.length);
			id = HTTP.decodeURIComponent(id);
			_mappings.push(new IndexPage(id, page));
		}
	}

	// Check added product names against names placed in layouts to detect when an
	// artwork piece did not get placed in a layout
	function checkPlaced(placed) {
		if (placed == null) {
			return;
		}

		missing = [];
		for (var i = 0; i < _mappings.length; i++) {
			var indexPage = _mappings[i];
			if (!(indexPage.index() in placed)) {
				missing.push(indexPage.page());
			}
		}

		if (missing.length > 0) {
			if (missing.length < _mappings.length) {
				_error = "Product '%1' pages %2 could not be placed in a layout"
						 .arg(this.job().getName())
						 .arg(missing.join(", "));
			} else {
				_error = "Product '%1' could not be placed in a layout"
						 .arg(this.job().getName());
			}
		}
	}
}

// Single created product name or artwork index to artwork page number mapping
class IndexPage {

	var _index;
	var _page;

	function IndexPage(index, page) {
		_index = index;
		_page = page;
	}

	function index() {
		return _index;
	}

	function page() {
		return _page;
	}
}

// JSON request builder helper class takes temp file and writes
// out JSON dictionaries/arrays
class Json {

	var _switch;
	var _job;
	var _temp;
	var _fd;
	var _counts;

	function Json(s, job) {
		_switch = s;
		_job = job;

		// Note: Switch 13 has a problem where non-English file names attached
		// to HTTP post (setAttachedFile) are left out of post.  Using
		// createPathWithName() here to ensure ASCII
		_temp = job.createPathWithName("request.json", false);
		_fd = new File(_temp, "UTF-8");
		_fd.open(File.WriteOnly);
		_counts = [];
		this.startDict();
	}

	function path() {
		return _temp;
	}

	function s() {
		return _switch;
	}

	function job() {
		return _job;
	}

	// Note: Assumes commit() has been called on this JSON object
	function print() {
		_job.log(1, File.read(this.path(), "UTF-8"));
	}

	function commit() {
		this.endDict();
		_fd.close();
	}

	function add(name, value) {
		this.startField(name);
		this.writeText(value);
	}

	// Add yes/no entry as true/false boolean
	function addYesNo(field, yesNo) {
		var value = "false";
		var ret = false;
		if (yesNo === "Yes") {
			value = "true";
			ret = true;
		}
		this.add(field, value);
		return ret;
	}

	function addProperty(tagName, field, isPercent) {
		var value = this.propertyValue(tagName, null);
		if (!isEmpty(value)) {
			if (isPercent) {
				value = this.addPercent(value);
			}
			this.add(field, value);
		}
	}

	// Add yes/no property as name/value entry
	function addYesNoProperty(tagName : String, field : String) {
		var yesNo = this.propertyValue(tagName, null);
		return this.addYesNo(field, yesNo);
	}

	// Add enum value combining and capitalizing value to form expected value
	function addEnumProperty(tagName : String, field : String,
					  connection : Connection) {
		var value = this.enumValue(tagName, connection);
		this.add(field, value);
	}

	function addArrayProperty(tagName, field) {
		var values = multiValues(_switch, _job, tagName);
	  if (values != null) {
			this.addArray(field, values);
	  }
  }

	function addArray(name, values) {
		this.startArray(name);
		for (var i = 0; i < values.length; ++i) {
			if (i > 0) {
				_fd.write(",\n");
			}
			this.writeText(values[i]);
		}
		this.endArray();
	}

	// Add margins entity field
	function addMargins(tagPrefix, name) {
	  this.startField(name);
		this.startDict();
		this.addProperty(tagPrefix + "Left", "left");
		this.addProperty(tagPrefix + "Top", "top");
		this.addProperty(tagPrefix + "Right", "right");
		this.addProperty(tagPrefix + "Bottom", "bottom");
		this.endDict();
	}

	// Get property value from connection if passed in or from switch + job
	function propertyValue(tagName : String, connection : Connection) {
		var value;
		if (connection != null) {
			value = connection.getPropertyValue(tagName);
		} else {
			value = _switch.getPropertyValue(tagName, _job);
		}
		return value;
	}

	// convert user friendly dropdown text to REST entity enum value
	function enumValue(tagName : String, connection : Connection) {
		var value = this.propertyValue(tagName, connection);
		if (!isEmpty(value)) {
			// Split user friendly dropdown value by spaces
			var words = value.split(" ");
			if (words.length > 1) {
				//Capitalize 2nd and subsequent words to form enum value
				var combined = words[0];
				for (var i = 1; i < words.length; i++) {
					var word = words[i];
					var first = word.left(1);
					combined += first.upper() + word.right(word.length - 1);
				}
				value = combined;
			}
		}
		return value;
	}

	function startField(name) {
		// Get current dict field count
		var count = _counts.pop();

		// Add comma to previous field if needed
		if (count > 0) {
			_fd.write(",\n");
		}

		// Write field name
		_fd.write("  ");
		this.writeText(name);
		_fd.write(": ");

		// Update current dict field count
		count++;
		_counts.push(count);
	}

	function startArray(name) {
		this.startField(name);
		_fd.write("[\n");
	}

	function endArray() {
		_fd.write("\n]");
	}

	function addArraySeparator() {
		_fd.write(",");
	}

	function startDict() {
		_fd.write("{\n");
		_counts.push(0);
	}

	function endDict() {
		_fd.write("}\n");
		_counts.pop();
	}

	function writeText(text) {
		// Surround text in quotes
		_fd.write("\"");

		// Make sure path is JSON friendly (no single backslash or double quote)
		text = text.replace(/\\/g, "/");
		text = text.replace(/\"/g, "\\\"");
		_fd.write(text);
		_fd.write("\"");
	}

	function addPercent(str) {
		var ret = str;
		if (ret.indexOf("%") === -1) {
			ret += "%";
		}
		return ret;
	}
}
