xquery version "3.0";

declare option exist:serialize "method=json media-type=text/javascript";

declare variable $variable external;

(: return value of $variable that should have been set in the query parameters:)
<result>{$variable}</result>
