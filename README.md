## Local Covid Tracker

I wanted to be able to see COVID stats for just the counties near me, as
opposed to either the whole state (not granular enough) or by zip code (_way_
too granular).

You can probably use this too. Maybe. It's not super polished but I think it
has enough CLI flags to work for other people.

You'll need Perl 5.30+ and a bunch of CPAN modules.

You can get all of the bits you need with [The ActiveState
Platform](https://platform.activestate.com/) by running these commands (and
accepting the default when it prompts):

    $> sh <(curl -q https://platform.activestate.com/dl/cli/install.sh)
    $> state activate

If you already have the `state` tool installed you can just run `state
activate`.

If you have `PERL5LIB` set (for example via `perlbrew`) you'll probably need
to unset that. This is a bug in the `state` tool as of 2020-12-12.

You can also install the prereqs using [`cpanm`](http://cpanmin.us/):

    $> cpanm --installdeps .

To see the list of accepted CLI options:

    $> ./report.pl --help
    usage: report.pl [-?h] [long options...]
        -h -? --usage --help    Prints this usage information.
        --iso STR               ISO code for country. Defaults to USA.
        --province STR          Region in the country. Defaults to Minnesota.
        --sub-provinces STR...  The sub-province regions you care about.
                                Defaults to Anoka, Hennepin, Ramsey, and
                                Scott.
        --start-date STR        Start date for COVID reporting. Defaults to
                                2020-10-15.

If you run it without any options it will fetch stats for some Minnesota
counties. Unless you're my neighbor this may not be that interesting for you.

I also have a hack in the code to hard code population data for regions I care
about. If you want to change the province or sub-provinces, you'll need to
provide your own hard coded data.
