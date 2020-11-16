#!/bin/sh -l

output=$(ec)
exit=$?

echo $output
echo ::set-output name=output::$output

exit $exit
