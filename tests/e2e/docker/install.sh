#!/bin/sh
# Install ProcessWire and seed the test site (run inside the web container)
set -e
su www-data -s /bin/sh -c 'php /e2e/install.php'
su www-data -s /bin/sh -c 'php /e2e/seed.php'
