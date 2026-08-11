resource "aws_route53_record" "app" {
  count = var.enable_custom_domain ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = local.fqdn
  type    = "A"

  alias {
    name                   = data.aws_lb.app[0].dns_name
    zone_id                = data.aws_lb.app[0].zone_id
    evaluate_target_health = true
  }
}
