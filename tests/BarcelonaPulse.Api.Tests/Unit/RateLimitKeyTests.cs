using System.Net;
using BarcelonaPulse.Api.Infrastructure;

namespace BarcelonaPulse.Api.Tests.Unit;

public sealed class RateLimitKeyTests
{
    [Theory]
    [InlineData("203.0.113.7", "203.0.113.7")]
    [InlineData("::ffff:203.0.113.7", "203.0.113.7")]
    [InlineData("2001:db8:1:2:aaaa:bbbb:cccc:dddd", "2001:db8:1:2::/64")]
    [InlineData("2001:db8:1:2::1", "2001:db8:1:2::/64")]
    public void Each_ipv4_counts_alone_and_each_ipv6_counts_by_its_64(string address, string key) =>
        Assert.Equal(key, ServiceRegistration.RateLimitKey(IPAddress.Parse(address)));

    [Fact]
    public void Without_an_address_all_share_one_limit() =>
        Assert.Equal("unknown", ServiceRegistration.RateLimitKey(null));
}
