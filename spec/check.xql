xquery version "3.0";

(: this is the important part for JSON results :)
declare option exist:serialize "method=json media-type=text/javascript";

(: return something :)
<result>
	{
		doc-available('/tmp/test.xml'),
		doc-available('/tmp/collection/test.xml')
	}
</result>
