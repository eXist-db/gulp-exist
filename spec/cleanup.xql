xquery version "3.0";
if (xmldb:collection-available("/tmp")) then xmldb:remove("/tmp") else ()
