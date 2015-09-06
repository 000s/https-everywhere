#!/usr/bin/env python2.7
#
# Run Chromium tests for HTTPS Everywhere
#
# This script may be executed as `python script.py [directory of CRX]`
#
# The script is compatible with Python 2. Python 3 is not tested.
# Selenium, WebDriver and Google Chrome (or Chromium) must be installed
# in order for the script to run successfully. A desktop version
# of linux is required for the script to run correctly as well.
# Otherwise, use pyvirtualdisplay.

import sys, os
from selenium import webdriver
from selenium.common.exceptions import WebDriverException

class bcolors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


chromeOps = webdriver.ChromeOptions()
chromeOps.add_extension(sys.argv[1])

if sys.platform.startswith("linux"):
    chromedriver_path = "/usr/lib/chromium-browser/chromedriver"
elif 'TRAVIS' in os.environ:
    # For TravisCI, we manually copy chromedriver to the local path.
    chromedriver_path = os.path.abspath("test/chromium/chromedriver")

    # Travis has setuid restrictions. I think this becomes unnecessary in M42+
    chromeOps.add_argument('--no-suid-sandbox')
else:
    # Let's hope it's in the user's path.
    chromedriver_path = "chromedriver"


try:
    # First argument is optional, if not specified will search path.
    driver = webdriver.Chrome(chromedriver_path, chrome_options=chromeOps)
except WebDriverException as e:
    error = e.__str__()

    if "executable needs to be in PATH" in e.__str__():
        print "ChromeDriver isn't installed. Check test/chrome/README.md " \
              "for instructions on how to install ChromeDriver"

        sys.exit(2)
    else:
        raise e

print ''

driver.get('http://libssh.org/robots.txt')

test_failed = False
if driver.current_url.startswith('https'):
    print bcolors.OKGREEN + "Chromium: HTTP to HTTPS redirection successful" + bcolors.ENDC
elif driver.current_url.startswith('http'):
    print bcolors.FAIL + "Chromium: HTTP to HTTPS redirection failed" + bcolors.ENDC
    test_failed = True
    sys.exit(1)

print ''

driver.quit()


if test_failed:
    sys.exit(1)
