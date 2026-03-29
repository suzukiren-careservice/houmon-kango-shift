use strict;
use IO::Socket::INET;
my $root = $ARGV[0];
my $server = IO::Socket::INET->new(
    LocalAddr => '0.0.0.0',
    LocalPort => 3001,
    Proto     => 'tcp',
    Listen    => 10,
    ReuseAddr => 1,
) or die "Cannot bind: $!";
print STDERR "Serving on http://localhost:3001/\n";
while (my $cl = $server->accept()) {
    my $req = '';
    my $line;
    while (defined($line = <$cl>)) {
        $req .= $line;
        last if $line eq "\r\n";
    }
    my ($path) = ($req =~ m{GET ([^ ]+)});
    $path = '/index.html' unless defined $path && length($path) > 1;
    $path =~ s{\?.*}{};
    # URLデコード（日本語パス対応）
    $path =~ s/%([0-9A-Fa-f]{2})/chr(hex($1))/ge;
    my $file = $root . $path;
    if (-f $file) {
        open(my $fh, '<:raw', $file) or do {
            print $cl "HTTP/1.1 500 Error\r\nConnection: close\r\n\r\n";
            close $cl; next;
        };
        local $/;
        my $body = <$fh>;
        close $fh;
        my ($ext) = ($file =~ m{\.(\w+)$});
        $ext = lc($ext // '');
        my %ct = (
            html => 'text/html; charset=utf-8',
            css  => 'text/css',
            js   => 'application/javascript',
        );
        my $ct = $ct{$ext} // 'text/plain';
        my $len = length($body);
        print $cl "HTTP/1.1 200 OK\r\nContent-Type: $ct\r\nContent-Length: $len\r\nConnection: close\r\n\r\n$body";
    } else {
        print STDERR "404: $file\n";
        print $cl "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\nNot Found";
    }
    close $cl;
}
