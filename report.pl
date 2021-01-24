#!/usr/bin/env perl

use v5.20;
use autodie qw( :all );
use experimental qw( signatures );
use feature qw( postderef );

package Reporter;

use DateTime;
use JSON::MaybeXS qw( decode_json encode_json );
use List::Util qw( sum );
use LWP::Simple;
use Path::Tiny qw( path );
use Specio::Declare qw( object_isa_type );
use Specio::Library::Builtins;
use Specio::Library::Path::Tiny;
use Specio::Library::String;
use Specio::Subs qw( Specio::Library::Builtins );
use URI::FromHash qw( uri );

use Moose;

with 'MooseX::Getopt::Dashes';

## no critic (TestingAndDebugging::ProhibitNoWarnings)
no warnings qw( experimental::postderef experimental::signatures );
## use critic

has iso => (
    is            => 'ro',
    isa           => t('NonEmptyStr'),
    default       => 'USA',
    documentation => 'ISO code for country. Defaults to USA.',
);

has province => (
    is            => 'ro',
    isa           => t('NonEmptyStr'),
    default       => 'Minnesota',
    documentation => 'Region in the country. Defaults to Minnesota.',
);

my $State = '**State**';

has sub_provinces => (
    is      => 'ro',
    isa     => t( 'ArrayRef', of => t('NonEmptyStr') ),
    default =>
        sub { [qw( Anoka Carver Dakota Hennepin Ramsey Scott Wright )] },
    documentation =>
        'The sub-province regions you care about. Defaults to Anoka, Carver, Dakota, Hennepin, Ramsey, Scott, and Wright.',
);

has start_date => (
    is            => 'ro',
    isa           => t('NonEmptyStr'),
    default       => '2020-10-15',
    documentation =>
        'Start date for COVID reporting. Defaults to 2020-10-15.',
);

has _start_date => (
    is       => 'ro',
    isa      => object_isa_type('DateTime'),
    init_arg => undef,
    lazy     => 1,
    builder  => '_build_start_date',
);

sub _build_start_date ($self) {
    my ( $y, $m, $d ) = split /-/, $self->start_date;
    my $dt = DateTime->new( year => $y, month => $m, day => $d );
    if ( $dt->year != 2020 ) {
        die sprintf( "Start date is not in 2020: %s\n", $self->start_date );
    }

    return $dt;
}

has _sub_provinces_hash => (
    is       => 'ro',
    isa      => t( 'HashRef', of => t('NonEmptyStr') ),
    init_arg => undef,
    lazy     => 1,
    default  => sub ($self) {
        return { map { $_ => 1 } $self->sub_provinces->@* };
    },
);

has _diffs => (
    is       => 'ro',
    isa      => t( 'HashRef', of => t( 'ArrayRef', of => t('Int') ) ),
    init_arg => undef,
    lazy     => 1,
    default  => sub ($self) {
        my %diffs = map { $_ => [] } $self->sub_provinces->@*, $State;
        \%diffs;
    },
);

has _ua => (
    is       => 'ro',
    isa      => object_isa_type('LWP::UserAgent'),
    init_arg => undef,
    lazy     => 1,
    default  => sub { LWP::UserAgent->new },
);

has _raw_cache_dir => (
    is      => 'ro',
    isa     => t('Path'),
    default => sub { _dir('raw') },
    lazy    => 1,
);

has _summary_cache_dir => (
    is      => 'ro',
    isa     => t('Path'),
    default => sub { _dir('summary') },
    lazy    => 1,
);

sub _dir ($name) {
    my $p = path( 'data', $name );
    $p->mkpath( 0, 0755 );
    return $p;
}

sub run ($self) {
    STDOUT->autoflush(1);

    my $dt    = $self->_start_date->clone;
    my $day_8 = $dt->clone->add( days => 7 );
    my $end   = DateTime->today->subtract( days => 1 );

    my @summary;
    my $i = 0;
    while ( $dt <= $end ) {
        my @sub_provinces = $self->_data_for_date($dt);
        for my $sp (@sub_provinces) {
            my $name = $sp->{sub_province};
            push $self->_diffs->{$name}->@*, $sp->{diff};
            if ( $dt >= $day_8 ) {
                $sp->{seven_day_average}
                    = sum(
                    $self->_diffs->{$name}->@[ ( $i - 7 ) .. ( $i - 1 ) ] )
                    / 7;
            }
        }

        push @summary, @sub_provinces;
        $dt->add( days => 1 );
        $i++;
    }

    path('summary.json')->spew_raw( encode_json( \@summary ) );

    return 0;
}

sub _data_for_date ( $self, $dt ) {
    my $day_cache_file
        = $self->_summary_cache_dir->child( $dt->ymd . '.json' );
    if ( $day_cache_file->exists ) {
        say sprintf( "%s: summary data is in cache", $dt->ymd )
            or die $!;
        return @{ decode_json( $day_cache_file->slurp_raw ) };
    }

    say sprintf( "%s: calculating summary data", $dt->ymd )
        or die $!;

    my $report = $self->_get_raw_data($dt)
        or return;
    my @day = $self->_summary_for_day( $dt, $report );
    $day_cache_file->spew_raw( encode_json( \@day ) );

    return @day;
}

sub _get_raw_data ( $self, $dt ) {
    my $raw_cache_file = $self->_raw_cache_dir->child( $dt->ymd . '.json' );
    if ( $raw_cache_file->exists ) {
        say sprintf( "%s: raw data cache file exists", $dt->ymd )
            or die $!;
        my $decoded = decode_json( $raw_cache_file->slurp_raw );
        return $decoded->{data}[0]
            if is_HashRef($decoded)
            && is_ArrayRef( $decoded->{data} )
            && $decoded->{data}->@*;
    }

    my ( $resp, $uri ) = $self->_get_data_from_api($dt);
    unless ( $resp->is_success ) {
        die sprintf(
            "Get $uri returned a %s\n%s\n", $resp->code,
            $resp->decoded_content
        );
    }

    my $content = $resp->decoded_content;
    my $decoded = decode_json($content);

    return unless $decoded;

    $raw_cache_file->spew_raw($content);

    return $decoded->{data}[0];
}

sub _get_data_from_api ( $self, $dt ) {
    my $uri = $self->_uri_for_date($dt);

    my $resp;
    my $x = 0;
    my $ok;
    do {
        say sprintf( "%s: getting raw data from API", $dt->ymd )
            or die $!;

        $resp = $self->_ua->get($uri);
        if ( $resp->is_success ) {
            $ok = 1;
        }
        else {
            if ( $resp->code == 502 ) {
                say 'got a 502 from API, retrying';
            }
            else {
                die sprintf(
                    "Get $uri returned a %s\n%s\n", $resp->code,
                    $resp->decoded_content
                );
            }
        }

        sleep 1;
    } while ( $x++ < 5 && !$ok );

    return ( $resp, $uri );
}

sub _uri_for_date ( $self, $date ) {
    return uri(
        scheme => 'https',
        host   => 'covid-api.com',
        path   => '/api/reports',
        query  => {
            iso             => $self->iso,
            region_province => $self->province,
            date            => $date->ymd,
        },
        query_separator => '&',
    );
}

# from https://worldpopulationreview.com/us-counties/states/mn
my %population = (
    $State   => 5_700_670,
    Anoka    => 360_401,
    Carver   => 106_645,
    Dakota   => 433_002,
    Hennepin => 1_273_760,
    Ramsey   => 551_770,
    Scott    => 150_835,
    Wright   => 140_441,
);

sub _summary_for_day ( $self, $dt, $report ) {
    my @sub_provinces;
    my $state = 0;

    for my $sub ( $report->{region}{cities}->@* ) {
        my $name = $sub->{name};
        if ( $self->_sub_provinces_hash->{$name} ) {
            push @sub_provinces,
                {
                day          => $dt->ymd,
                sub_province => $name,
                diff         => $sub->{confirmed_diff},
                population   => $population{$name},
                };
        }
        else {
            $state += $sub->{confirmed_diff};
        }
    }

    push @sub_provinces,
        {
        day          => $dt->ymd,
        sub_province => $State,
        diff         => $state,
        population   => $population{$State},
        };

    return @sub_provinces;
}

package main;

exit Reporter->new_with_options->run;
