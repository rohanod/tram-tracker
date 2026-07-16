# Vehicle Tracker

Language for the private transit vehicle history context.

## Language

**Trip Entry**:
A saved observation that the user was on or saw a transit vehicle at a specific capture time, with a vehicle number, route classification, and optional capture location.
_Avoid_: Todo, ride, record

**Vehicle Number**:
The 3-4 digit number visible on a transit vehicle and entered by the user.
_Avoid_: Tram id, fleet id

**Route Corridor**:
A configured stretch of a transit route used to infer the line from capture location.
_Avoid_: Stop list, line

**Leg**:
The user's commute direction label for a Trip Entry, such as From home or To school. The visible UI calls this `Direction`; the data/API may call it `headsign` when it represents a transit destination.
_Avoid_: category

**Headsign**:
The destination text displayed by a transit line, used as the source for a selectable Direction when line metadata is available.
_Avoid_: free-form direction when a known headsign exists

**Other Line**:
A non-default official TPG line selected through the Other Line popup. It retains the `Other` control identity while displaying the selected line number.
_Avoid_: replacing the Other control with a separate line button

**Capture Location**:
The rounded device location stored at the moment a Trip Entry is created, used for later manual review.
_Avoid_: GPS trail, live location

**Saved Time**:
The time a Trip Entry was saved by the user, shown in the recent review list.
_Avoid_: Sync time, database update time

**Pending Sync**:
A Trip Entry stored on the client's device that has not yet been written to the Lakebed database.
_Avoid_: Draft, unsaved

**Pending Delete**:
A deletion request stored on the client's device after the Trip Entry has been removed locally, waiting to remove or confirm absence of the matching database entry.
_Avoid_: Deleted Trip Entry, hidden row

**Shortcut Save**:
A token-authorized API save from a location-based automation, usually passing vehicle number, capture location, line, leg, and capture type.
_Avoid_: Public save, webhook
