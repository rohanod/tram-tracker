# Vehicle Tracker

Language for the private tram vehicle history context.

## Language

**Trip Entry**:
A saved observation that the user was on a tram vehicle at a specific capture time, with a vehicle number, route classification, and optional capture location.
_Avoid_: Todo, ride, record

**Vehicle Number**:
The 3-4 digit number visible on a tram vehicle and entered by the user.
_Avoid_: Tram id, fleet id

**Route Corridor**:
A configured stretch of tram route used to infer the default leg from capture location.
_Avoid_: Stop list, line

**Leg**:
The user's commute direction label for a Trip Entry, such as From home or To school.
_Avoid_: Direction, category

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
