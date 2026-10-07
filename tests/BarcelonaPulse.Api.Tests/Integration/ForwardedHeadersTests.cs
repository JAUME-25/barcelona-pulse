using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace BarcelonaPulse.Api.Tests.Integration;

/// <summary>
/// Detrás de nginx todas las peticiones llegan desde la IP del proxy: el límite por IP tiene que
/// usar la del cliente (X-Forwarded-For), y solo si el proxy es de confianza.
/// </summary>
public sealed class ForwardedHeadersTests
{
    private const string Proxy = "172.18.0.1";
    private const int TooManyRequests = (int)HttpStatusCode.TooManyRequests;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // Sin base de datos: el límite se aplica antes de llegar al endpoint, y solo cuenta peticiones.
    private static WebApplicationFactory<Program> Factory(string knownNetworks) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Testing");
            b.UseSetting("ConnectionStrings:Postgres", "Host=127.0.0.1;Port=1;Timeout=1");
            b.UseSetting("RateLimiting:PermitPerMinute", "2");
            b.UseSetting("ForwardedHeaders:KnownNetworks", knownNetworks);
        });

    private static async Task<int> GetThroughProxyAsync(WebApplicationFactory<Program> factory, string client)
    {
        var context = await factory.Server.SendAsync(c =>
        {
            c.Request.Method = "GET";
            c.Request.Path = "/api/sources";
            c.Connection.RemoteIpAddress = IPAddress.Parse(Proxy);
            c.Request.Headers["X-Forwarded-For"] = client;
        }, Ct);
        return context.Response.StatusCode;
    }

    [Fact]
    public async Task Each_client_behind_a_trusted_proxy_has_its_own_limit()
    {
        await using var factory = Factory("172.16.0.0/12");

        await GetThroughProxyAsync(factory, "203.0.113.5");
        await GetThroughProxyAsync(factory, "203.0.113.5");
        var third = await GetThroughProxyAsync(factory, "203.0.113.5");
        var other = await GetThroughProxyAsync(factory, "198.51.100.7");

        Assert.Equal(TooManyRequests, third);
        Assert.NotEqual(TooManyRequests, other);
    }

    [Fact]
    public async Task A_rejected_request_says_when_to_try_again()
    {
        await using var factory = Factory("172.16.0.0/12");
        await GetThroughProxyAsync(factory, "203.0.113.8");
        await GetThroughProxyAsync(factory, "203.0.113.8");

        var context = await factory.Server.SendAsync(c =>
        {
            c.Request.Method = "GET";
            c.Request.Path = "/api/sources";
            c.Connection.RemoteIpAddress = IPAddress.Parse(Proxy);
            c.Request.Headers["X-Forwarded-For"] = "203.0.113.8";
        }, Ct);

        Assert.Equal(TooManyRequests, context.Response.StatusCode);
        var retryAfter = int.Parse(context.Response.Headers.RetryAfter.ToString(), System.Globalization.CultureInfo.InvariantCulture);
        Assert.InRange(retryAfter, 1, 60);
    }

    [Fact]
    public async Task Addresses_of_the_same_ipv6_64_share_their_limit()
    {
        await using var factory = Factory("172.16.0.0/12");

        await GetThroughProxyAsync(factory, "2001:db8:1:2::10");
        await GetThroughProxyAsync(factory, "2001:db8:1:2::11");
        var third = await GetThroughProxyAsync(factory, "2001:db8:1:2:ffff::12");
        var otherNetwork = await GetThroughProxyAsync(factory, "2001:db8:1:3::10");

        Assert.Equal(TooManyRequests, third);
        Assert.NotEqual(TooManyRequests, otherNetwork);
    }

    [Fact]
    public async Task An_untrusted_proxy_cannot_choose_the_client_address()
    {
        // Sin redes de confianza, la cabecera no cuenta: todo es del proxy y comparte límite.
        await using var factory = Factory(string.Empty);

        await GetThroughProxyAsync(factory, "203.0.113.5");
        await GetThroughProxyAsync(factory, "203.0.113.6");
        var third = await GetThroughProxyAsync(factory, "203.0.113.7");

        Assert.Equal(TooManyRequests, third);
    }
}
