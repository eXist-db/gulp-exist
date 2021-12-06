xquery version "3.0";

declare option exist:serialize "method=json media-type=text/javascript";

(: return value of $variable that should have been set in the query parameters:)
<result>{$variable}</result>
